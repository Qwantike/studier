import { Router } from "express";
import { z } from "zod";
import { pool, withTx } from "../db/pool.js";
import { HttpError } from "../errors.js";
import { applyCalendar, fetchCalendar, normalizeUrl, syncAll, syncSource } from "../services/calendarSources.js";
import { ah, idSchema } from "./crud.js";

const createSchema = z.object({
  url: z.string().trim().min(1, "L'adresse est requise").max(2000),
  name: z.string().trim().max(200).optional(),
});
const updateSchema = z.object({ name: z.string().trim().min(1, "Le nom est requis").max(200) });
const deleteQuery = z.object({ delete_events: z.enum(["true", "false"]).optional() });

const LIST_SQL = `
  SELECT s.id, s.name, s.url, s.last_synced_at, s.last_error, s.created_at,
         COUNT(e.id)::int AS event_count
  FROM calendar_sources s LEFT JOIN calendar_events e ON e.source_id = s.id`;

async function getSource(id: string) {
  const { rows } = await pool.query(`${LIST_SQL} WHERE s.id = $1 GROUP BY s.id`, [id]);
  return rows[0] ?? null;
}

export const calendarSourcesRouter = Router();

calendarSourcesRouter.get("/", ah(async (_req, res) => {
  const { rows } = await pool.query(`${LIST_SQL} GROUP BY s.id ORDER BY s.created_at`);
  res.json(rows);
}));

// Ajout : on télécharge d'abord (une adresse injoignable ne crée rien), puis on synchronise.
calendarSourcesRouter.post("/", ah(async (req, res) => {
  const body = createSchema.parse(req.body);
  const url = normalizeUrl(body.url);
  const dup = await pool.query("SELECT 1 FROM calendar_sources WHERE url = $1", [url]);
  if (dup.rowCount) throw new HttpError(409, "Ce calendrier est déjà ajouté");

  const cal = await fetchCalendar(url);
  const calName = (cal.vcalendar as Record<string, unknown> | undefined)?.["WR-CALNAME"];
  // Selon la présence de paramètres, node-ical renvoie une chaîne ou { val, params }.
  const fromFeed = typeof calName === "string" ? calName : (calName as { val?: unknown } | undefined)?.val;
  const name = body.name || (typeof fromFeed === "string" ? fromFeed.trim() : "") || new URL(url).hostname;

  const { rows } = await pool.query<{ id: string }>("INSERT INTO calendar_sources (name, url) VALUES ($1, $2) RETURNING id", [name, url]);
  const id = rows[0]!.id;
  try {
    const result = await applyCalendar(id, cal);
    res.status(201).json({ source: await getSource(id), result });
  } catch (err) {
    await pool.query("DELETE FROM calendar_sources WHERE id = $1", [id]); // pas d'abonnement à moitié créé
    throw err;
  }
}));

// Déclaré avant /:id/sync pour la lisibilité ; les chemins ne se chevauchent pas.
calendarSourcesRouter.post("/sync-all", ah(async (_req, res) => {
  res.json(await syncAll());
}));

calendarSourcesRouter.post("/:id/sync", ah(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const result = await syncSource(id);
  res.json({ source: await getSource(id), result });
}));

calendarSourcesRouter.patch("/:id", ah(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const { name } = updateSchema.parse(req.body);
  const { rowCount } = await pool.query("UPDATE calendar_sources SET name = $1 WHERE id = $2", [name, id]);
  if (!rowCount) throw new HttpError(404, "Calendrier introuvable");
  res.json(await getSource(id));
}));

// ?delete_events=true supprime aussi les événements synchronisés ; sinon ils sont conservés.
calendarSourcesRouter.delete("/:id", ah(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const { delete_events } = deleteQuery.parse(req.query);
  const found = await withTx(async (client) => {
    if (delete_events === "true") await client.query("DELETE FROM calendar_events WHERE source_id = $1", [id]);
    const r = await client.query("DELETE FROM calendar_sources WHERE id = $1", [id]);
    return (r.rowCount ?? 0) > 0;
  });
  if (!found) throw new HttpError(404, "Calendrier introuvable");
  res.status(204).end();
}));
