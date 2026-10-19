import { pool } from "../db/pool.js";

export const EVENT_SELECT_SQL = `
  SELECT e.id, e.title, e.starts_at, e.ends_at, e.location, e.subject_id,
         (e.ics_uid IS NOT NULL) AS imported, cs.name AS source_name,
         s.name AS subject_name, s.color AS subject_color
  FROM calendar_events e
  LEFT JOIN subjects s ON s.id = e.subject_id
  LEFT JOIN calendar_sources cs ON cs.id = e.source_id`;

export async function getEvent(id: string) {
  const { rows } = await pool.query(`${EVENT_SELECT_SQL} WHERE e.id = $1`, [id]);
  return rows[0] ?? null;
}

// Événements qui chevauchent [from, to[.
export async function listEventsBetween(from: string, to: string) {
  const { rows } = await pool.query(
    `${EVENT_SELECT_SQL}
     WHERE e.starts_at < $2 AND GREATEST(e.ends_at, e.starts_at + interval '1 minute') > $1
     ORDER BY e.starts_at, e.ends_at`, [from, to]);
  return rows;
}
