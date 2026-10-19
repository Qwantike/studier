import ical, { type CalendarResponse } from "node-ical";
import { pool, withTx } from "../db/pool.js";
import { HttpError } from "../errors.js";
import { eventsFromCalendar, focusDate, looksLikeCalendar, upsertEvents } from "./ics.js";

const FETCH_TIMEOUT_MS = 20_000;

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

const describe = (err: unknown): string => {
  const e = err as { name?: string; message?: string };
  return e.name === "TimeoutError" || e.name === "AbortError" ? "délai dépassé" : (e.message ?? "erreur inconnue");
};

/** Télécharge et analyse un calendrier distant avec ical.fromURL(). */
export function fetchCalendar(url: string): Promise<CalendarResponse> {
  return new Promise<CalendarResponse>((resolve, reject) => {
    ical.fromURL(
      url,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: "text/calendar, text/plain, */*" } },
      (err, data) => (err || !data ? reject(err ?? new Error("réponse vide")) : resolve(data)),
    );
  }).then((cal) => {
    if (!looksLikeCalendar(cal)) throw new Error("cette adresse ne renvoie pas un calendrier .ics");
    return cal;
  }).catch((err: unknown) => { throw new HttpError(502, `Impossible de récupérer le calendrier : ${describe(err)}`); });
}

/**
 * Applique un calendrier téléchargé à un abonnement : upsert des événements, puis suppression des
 * événements À VENIR de cet abonnement qui ont disparu du flux (le passé est conservé).
 * Un flux vide ne supprime rien, pour ne pas vider l'agenda sur une réponse anormale.
 */
export async function applyCalendar(sourceId: string, cal: CalendarResponse): Promise<SyncResult> {
  const events = eventsFromCalendar(cal);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const r = await withTx(async (client) => {
    const { created, updated } = await upsertEvents(client, events, sourceId);
    let removed = 0;
    if (events.length > 0) {
      const res = await client.query(
        `DELETE FROM calendar_events
         WHERE source_id = $1 AND starts_at >= $2 AND NOT (ics_uid = ANY($3::text[]))`,
        [sourceId, startOfToday, events.map((e) => e.uid)]);
      removed = res.rowCount ?? 0;
    }
    await client.query("UPDATE calendar_sources SET last_synced_at = now(), last_error = NULL WHERE id = $1", [sourceId]);
    return { created, updated, removed };
  });
  return { ...r, unchanged: events.length - r.created - r.updated, focus_date: focusDate(events) };
}

const running = new Set<string>(); // évite deux synchronisations simultanées du même abonnement

export async function syncSource(id: string): Promise<SyncResult> {
  if (running.has(id)) throw new HttpError(409, "Synchronisation déjà en cours");
  running.add(id);
  try {
    const { rows } = await pool.query<{ url: string }>("SELECT url FROM calendar_sources WHERE id = $1", [id]);
    if (!rows[0]) throw new HttpError(404, "Calendrier introuvable");
    try {
      return await applyCalendar(id, await fetchCalendar(rows[0].url));
    } catch (err) {
      // L'échec est mémorisé pour être affiché à côté de l'abonnement.
      await pool.query("UPDATE calendar_sources SET last_error = $2 WHERE id = $1", [id, (err as Error).message]).catch(() => undefined);
      throw err;
    }
  } finally {
    running.delete(id);
  }
}

export async function syncAll() {
  const { rows } = await pool.query<{ id: string; name: string }>("SELECT id, name FROM calendar_sources ORDER BY created_at");
  const results: { id: string; name: string; ok: boolean; result?: SyncResult; error?: string }[] = [];
  for (const s of rows) { // séquentiel : on ne bombarde pas les serveurs distants
    try { results.push({ id: s.id, name: s.name, ok: true, result: await syncSource(s.id) }); }
    catch (err) { results.push({ id: s.id, name: s.name, ok: false, error: (err as Error).message }); }
  }
  return results;
}

/** Synchronisation périodique en arrière-plan (au démarrage, puis toutes les N minutes). */
export function startScheduler(minutes: number): void {
  if (minutes <= 0) return;
  const run = () => void syncAll()
    .then((rs) => rs.filter((r) => !r.ok).forEach((r) => console.warn(`Synchro « ${r.name} » : ${r.error}`)))
    .catch((err: unknown) => console.warn("Synchro des calendriers :", err));
  setTimeout(run, 5_000);
  setInterval(run, minutes * 60_000);
}
