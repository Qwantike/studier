import type { PoolClient } from "pg";
import ical, { type CalendarResponse, type ParameterValue, type VEvent } from "node-ical";
import { HttpError } from "../errors.js";

const MAX_EVENTS = 20_000;
// Les événements récurrents (RRULE) sont dépliés dans cette fenêtre autour d'aujourd'hui.
const RECURRENCE_PAST_DAYS = 90;
const RECURRENCE_FUTURE_DAYS = 400;
const DAY_MS = 86_400_000;

export interface IcsEvent { uid: string; title: string; start: Date; end: Date; location: string | null }

export const paramText = (v: ParameterValue | undefined): string => (typeof v === "string" ? v : (v?.val ?? "")).trim();

export function parseIcsText(content: string): CalendarResponse {
  if (!content.includes("BEGIN:VCALENDAR")) throw new HttpError(400, "Ce fichier n'est pas un calendrier .ics valide");
  try { return ical.parseICS(content); } catch { throw new HttpError(400, "Impossible de lire ce fichier .ics"); }
}

/** Vrai si la réponse ressemble à un calendrier (et pas, par exemple, à une page de connexion HTML). */
export const looksLikeCalendar = (cal: CalendarResponse): boolean =>
  cal.vcalendar !== undefined || Object.values(cal).some((c) => c?.type === "VEVENT");

export function eventsFromCalendar(cal: CalendarResponse): IcsEvent[] {
  const now = Date.now();
  const from = new Date(now - RECURRENCE_PAST_DAYS * DAY_MS);
  const to = new Date(now + RECURRENCE_FUTURE_DAYS * DAY_MS);
  // Dédoublonnage par UID : la dernière occurrence l'emporte.
  const byUid = new Map<string, IcsEvent>();

  for (const comp of Object.values(cal)) {
    if (!comp || comp.type !== "VEVENT") continue;
    const ev: VEvent = comp;
    // Les événements simples ne sont pas limités dans le temps ; seules les séries sont dépliées sur la fenêtre.
    const instances = ev.rrule
      ? ical.expandRecurringEvent(ev, { from, to, expandOngoing: true })
      : [{ start: ev.start, end: ev.end ?? ev.start, isFullDay: ev.datetype === "date", isRecurring: false, isOverride: false, event: ev }];

    for (const inst of instances) {
      const start = new Date(inst.start);
      if (Number.isNaN(start.getTime())) continue;
      let end = new Date(inst.end);
      // DTEND absent ou incohérent : 1 jour pour une journée entière, sinon 1 h.
      if (Number.isNaN(end.getTime()) || end <= start) end = new Date(start.getTime() + (inst.isFullDay ? DAY_MS : 3_600_000));
      // Chaque occurrence d'une série a son propre identifiant stable.
      const uid = inst.isRecurring || inst.isOverride ? `${ev.uid}#${start.toISOString()}` : ev.uid;
      byUid.set(uid, { uid, title: paramText(inst.event.summary) || "(Sans titre)", start, end, location: paramText(inst.event.location) || null });
    }
    if (byUid.size > MAX_EVENTS) throw new HttpError(400, "Calendrier trop volumineux");
  }
  return [...byUid.values()];
}

/** Date à afficher après un import : premier événement à venir, sinon le dernier. */
export function focusDate(events: IcsEvent[]): string | null {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const starts = events.map((e) => e.start.getTime()).sort((a, b) => a - b);
  const focus = starts.find((t) => t >= startOfToday.getTime()) ?? starts[starts.length - 1];
  return focus !== undefined ? new Date(focus).toISOString() : null;
}

/**
 * Upsert par (user_id, ics_uid) (à appeler dans une transaction). Seules les lignes réellement modifiées sont
 * comptées ; la matière rattachée à la main n'est jamais écrasée. sourceId est conservé si l'import
 * ne vient pas d'un abonnement (null).
 */
export async function upsertEvents(client: PoolClient, userId: string, events: IcsEvent[], sourceId: string | null) {
  let created = 0;
  let updated = 0;
  for (let i = 0; i < events.length; i += 2000) {
    const chunk = events.slice(i, i + 2000);
    const { rows } = await client.query<{ inserted: boolean }>(
      `INSERT INTO calendar_events AS t (user_id, title, starts_at, ends_at, location, ics_uid, source_id)
       SELECT $6::uuid, u.*, $7::uuid
       FROM unnest($1::text[], $2::timestamptz[], $3::timestamptz[], $4::text[], $5::text[]) AS u
       ON CONFLICT (user_id, ics_uid) DO UPDATE
         SET title = EXCLUDED.title, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
             location = EXCLUDED.location, source_id = COALESCE(EXCLUDED.source_id, t.source_id)
         WHERE (t.title, t.starts_at, t.ends_at, t.location, t.source_id)
               IS DISTINCT FROM (EXCLUDED.title, EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.location,
                                 COALESCE(EXCLUDED.source_id, t.source_id))
       RETURNING (xmax = 0) AS inserted`,
      [chunk.map((e) => e.title), chunk.map((e) => e.start), chunk.map((e) => e.end),
      chunk.map((e) => e.location), chunk.map((e) => e.uid), userId, sourceId]);
    for (const r of rows) { if (r.inserted) created++; else updated++; }
  }
  return { created, updated };
}