import type { CalendarResponse } from "node-ical";
import { env } from "../config.js";
import { pool, withTx } from "../db/pool.js";
import { HttpError } from "../errors.js";
import { eventsFromCalendar, focusDate, looksLikeCalendar, parseIcsText, upsertEvents } from "./ics.js";
import { FetchError, safeFetchText } from "./safeFetch.js";

export interface SyncResult { created: number; updated: number; unchanged: number; removed: number; focus_date: string | null }

/** webcal:// (schéma des liens d'abonnement) devient https:// ; seuls http(s) sont acceptés. */
export function normalizeUrl(raw: string): string {
  const candidate = raw.trim().replace(/^webcals?:\/\//i, "https://");
  let url: URL;
  try { url = new URL(candidate); } catch { throw new HttpError(400, "URL invalide"); }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpError(400, "L'adresse doit commencer par http://, https:// ou webcal://");
  }
  return url.toString();
}

/** Les URL d'abonnement contiennent souvent un jeton secret : l'API n'en renvoie que l'hôte. */
export function maskUrl(raw: string): string {
  try { const u = new URL(raw); return `${u.protocol}//${u.host}/…`; } catch { return "…"; }
}

const hostOf = (raw: string): string => { try { return new URL(raw).hostname; } catch { return "?"; } };

// Message affichable : on n'expose jamais le détail d'une erreur réseau (il pourrait révéler le réseau interne).
function describe(err: unknown): string {
  if (err instanceof FetchError) return err.message;
  if (err instanceof HttpError) return "cette adresse ne renvoie pas un calendrier .ics";
  const e = err as { name?: string; code?: string };
  if (e.name === "TimeoutError" || e.name === "AbortError") return "délai dépassé";
  if (e.code === "ENOTFOUND" || e.code === "EAI_AGAIN") return "adresse introuvable";
  return "connexion impossible";
}

/** Télécharge (de façon sécurisée) et analyse un calendrier distant. */
export async function fetchCalendar(url: string): Promise<CalendarResponse> {
  try {
    const cal = parseIcsText((await safeFetchText(url)).replace(/^\uFEFF/, ""));
    if (!looksLikeCalendar(cal)) throw new FetchError("cette adresse ne renvoie pas un calendrier .ics");
    return cal;
  } catch (err) {
    throw new HttpError(502, `Impossible de récupérer le calendrier : ${describe(err)}`);
  }
}

const intervalMinutes = () => env.CALENDAR_SYNC_MINUTES || 60;

/**
 * Applique un calendrier téléchargé à un abonnement : upsert des événements, puis suppression des
 * événements À VENIR de cet abonnement qui ont disparu du flux (le passé est conservé).
 * Un flux vide ne supprime rien, pour ne pas vider l'agenda sur une réponse anormale.
 */
export async function applyCalendar(sourceId: string, userId: string, cal: CalendarResponse): Promise<SyncResult> {
  const events = eventsFromCalendar(cal);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const r = await withTx(async (client) => {
    const { created, updated } = await upsertEvents(client, userId, events, sourceId);
    let removed = 0;
    if (events.length > 0) {
      const res = await client.query(
        `DELETE FROM calendar_events
         WHERE source_id = $1 AND user_id = $2 AND starts_at >= $3 AND NOT (ics_uid = ANY($4::text[]))`,
        [sourceId, userId, startOfToday, events.map((e) => e.uid)]);
      removed = res.rowCount ?? 0;
    }
    // Prochaine synchro dans N minutes (+ jusqu'à 1 min aléatoire pour étaler la charge).
    await client.query(
      `UPDATE calendar_sources
       SET last_synced_at = now(), last_error = NULL, failures = 0,
           next_sync_at = now() + make_interval(mins => $3::int) + make_interval(secs => floor(random() * 60))
       WHERE id = $1 AND user_id = $2`, [sourceId, userId, intervalMinutes()]);
    return { created, updated, removed };
  });
  return { ...r, unchanged: events.length - r.created - r.updated, focus_date: focusDate(events) };
}

// Échec : message mémorisé (affiché à côté de l'abonnement) et nouvelle tentative de plus en plus tardive (max 24 h).
const recordFailure = (id: string, message: string) =>
  pool.query(
    `UPDATE calendar_sources
     SET last_error = $2, failures = failures + 1,
         next_sync_at = now() + make_interval(mins => LEAST($3::int * (2 ^ LEAST(failures, 10))::int, 1440))
     WHERE id = $1`, [id, message, intervalMinutes()]).catch(() => undefined);

const running = new Set<string>(); // évite deux synchronisations simultanées du même abonnement

/** Synchronisation manuelle d'un abonnement de l'utilisateur. */
export async function syncSource(id: string, userId: string): Promise<SyncResult> {
  if (running.has(id)) throw new HttpError(409, "Synchronisation déjà en cours");
  running.add(id);
  try {
    const { rows } = await pool.query<{ url: string }>(
      "SELECT url FROM calendar_sources WHERE id = $1 AND user_id = $2", [id, userId]);
    if (!rows[0]) throw new HttpError(404, "Calendrier introuvable");
    try {
      return await applyCalendar(id, userId, await fetchCalendar(rows[0].url));
    } catch (err) {
      await recordFailure(id, (err as Error).message);
      throw err;
    }
  } finally {
    running.delete(id);
  }
}

/** Synchronise tous les abonnements de l'utilisateur (séquentiel : on ne bombarde pas les serveurs distants). */
export async function syncAll(userId: string) {
  const { rows } = await pool.query<{ id: string; name: string }>(
    "SELECT id, name FROM calendar_sources WHERE user_id = $1 ORDER BY created_at", [userId]);
  const results: { id: string; name: string; ok: boolean; result?: SyncResult; error?: string }[] = [];
  for (const s of rows) {
    try { results.push({ id: s.id, name: s.name, ok: true, result: await syncSource(s.id, userId) }); }
    catch (err) { results.push({ id: s.id, name: s.name, ok: false, error: (err as Error).message }); }
  }
  return results;
}

// --- Synchronisation périodique en arrière-plan ---
const TICK_MS = 60_000;
const BATCH = 50;        // abonnements traités par passage
const CONCURRENCY = 4;   // téléchargements simultanés
const SCHEDULER_LOCK = 727_001; // verrou PostgreSQL : une seule instance du serveur planifie à la fois

interface DueSource { id: string; user_id: string; url: string }

// Une même URL partagée par plusieurs abonnés (calendrier d'une promo) n'est téléchargée qu'une fois.
async function syncGroup(url: string, sources: DueSource[]): Promise<void> {
  let cal: CalendarResponse;
  try { cal = await fetchCalendar(url); } catch (err) {
    console.warn(`Synchro ${hostOf(url)} : ${(err as Error).message}`);
    await Promise.all(sources.map((s) => recordFailure(s.id, (err as Error).message)));
    return;
  }
  for (const s of sources) {
    if (running.has(s.id)) continue;
    running.add(s.id);
    try { await applyCalendar(s.id, s.user_id, cal); }
    catch (err) { await recordFailure(s.id, (err as Error).message); }
    finally { running.delete(s.id); }
  }
}

export async function syncDue(): Promise<void> {
  const lock = await pool.connect();
  try {
    const got = await lock.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1::bigint) AS ok", [SCHEDULER_LOCK]);
    if (!got.rows[0]?.ok) return; // un autre processus s'en occupe
    try {
      const { rows } = await pool.query<DueSource>(
        "SELECT id, user_id, url FROM calendar_sources WHERE next_sync_at <= now() ORDER BY next_sync_at LIMIT $1", [BATCH]);
      const byUrl = new Map<string, DueSource[]>();
      for (const s of rows) byUrl.set(s.url, [...(byUrl.get(s.url) ?? []), s]);
      const groups = [...byUrl.entries()];
      let next = 0;
      const worker = async () => {
        for (let g = groups[next++]; g; g = groups[next++]) await syncGroup(g[0], g[1]);
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, groups.length) }, worker));
    } finally {
      await lock.query("SELECT pg_advisory_unlock($1::bigint)", [SCHEDULER_LOCK]);
    }
  } finally {
    lock.release();
  }
}

/** Vérifie chaque minute quels abonnements sont à resynchroniser (voir next_sync_at). minutes = 0 : désactivé. */
export function startScheduler(minutes: number): void {
  if (minutes <= 0) return;
  let ticking = false;
  const tick = () => {
    if (ticking) return;
    ticking = true;
    syncDue()
      .catch((err: unknown) => console.warn("Synchro des calendriers :", err))
      .finally(() => { ticking = false; });
  };
  setTimeout(tick, 5_000);
  setInterval(tick, TICK_MS);
}