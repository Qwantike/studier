import { pool } from "../db/pool.js";

export const EVENT_SELECT_SQL = `
  SELECT e.id, e.title, e.starts_at, e.ends_at, e.location, e.subject_id,
         (e.ics_uid IS NOT NULL) AS imported, cs.name AS source_name,
         s.name AS subject_name, s.color AS subject_color
  FROM calendar_events e
  LEFT JOIN subjects s ON s.id = e.subject_id
  LEFT JOIN calendar_sources cs ON cs.id = e.source_id`;

export async function getEvent(id: string, userId: string) {
  const { rows } = await pool.query(`${EVENT_SELECT_SQL} WHERE e.id = $1 AND e.user_id = $2`, [id, userId]);
  return rows[0] ?? null;
}

// Événements de l'utilisateur qui chevauchent [from, to[.
export async function listEventsBetween(userId: string, from: string, to: string) {
  const { rows } = await pool.query(
    `${EVENT_SELECT_SQL}
     WHERE e.user_id = $1 AND e.starts_at < $3 AND GREATEST(e.ends_at, e.starts_at + interval '1 minute') > $2
     ORDER BY e.starts_at, e.ends_at`, [userId, from, to]);
  return rows;
}