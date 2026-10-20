import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { pool, withTx } from "../db/pool.js";
import { HttpError } from "../errors.js";
import { uid } from "../middleware/auth.js";
import { applyCalendar, fetchCalendar, maskUrl, normalizeUrl, syncAll, syncSource } from "../services/calendarSources.js";
import { ah, idSchema } from "./crud.js";

const createSchema = z.object({
  url: z.string().trim().min(1, "L'adresse est requise").max(2000),
  name: z.string().trim().max(200).optional(),
});
const updateSchema = z.object({ name: z.string().trim().min(1, "Le nom est requis").max(200) });
const deleteQuery = z.object({ delete_events: z.enum(["true", "false"]).optional() });

const MAX_SOURCES_PER_USER = 10;

// Chaque ajout ou synchronisation manuelle contacte un serveur distant : débit limité par utilisateur.
const syncLimiter = rateLimit({
  windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? "anonymous",
  message: { error: { message: "Trop de synchronisations, réessayez dans une minute" } },
});

const LIST_SQL = `
  SELECT s.id, s.name, s.url, s.last_synced_at, s.last_error, s.created_at,
         COUNT(e.id)::int AS event_count
  FROM calendar_sources s LEFT JOIN calendar_events e ON e.source_id = s.id`;

const masked = <T extends { url: string }>(row: T): T => ({ ...row, url: maskUrl(row.url) });

async function getSource(id: string, userId: string) {
  const { rows } = await pool.query(`${LIST_SQL} WHERE s.id = $1 AND s.user_id = $2 GROUP BY s.id`, [id, userId]);
  return rows[0] ? masked(rows[0]) : null;
}

export const calendarSourcesRouter = Router();

calendarSourcesRouter.get("/", ah(async (req, res) => {
  const { rows } = await pool.query(`${LIST_SQL} WHERE s.user_id = $1 GROUP BY s.id ORDER BY s.created_at`, [uid(req)]);
  res.json(rows.map(masked));
}));

// Ajout : on télécharge d'abord (une adresse injoignable ne crée rien), puis on synchronise.
calendarSourcesRouter.post("/", syncLimiter, ah(async (req, res) => {
  const userId = uid(req);
  const body = createSchema.parse(req.body);
  const url = normalizeUrl(body.url);
  const count = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM calendar_sources WHERE user_id = $1", [userId]);
  if ((count.rows[0]?.n ?? 0) >= MAX_SOURCES_PER_USER) throw new HttpError(400, `Limite de ${MAX_SOURCES_PER_USER} calendriers atteinte`);
  const dup = await pool.query("SELECT 1 FROM calendar_sources WHERE url = $1 AND user_id = $2", [url, userId]);
  if (dup.rowCount) throw new HttpError(409, "Ce calendrier est déjà ajouté");

  const cal = await fetchCalendar(url);
  const calName = (cal.vcalendar as Record<string, unknown> | undefined)?.["WR-CALNAME"];
  // Selon la présence de paramètres, node-ical renvoie une chaîne ou { val, params }.
  const fromFeed = typeof calName === "string" ? calName : (calName as { val?: unknown } | undefined)?.val;
  const name = body.name || (typeof fromFeed === "string" ? fromFeed.trim() : "") || new URL(url).hostname;

  let id: string;
  try {
    const { rows } = await pool.query<{ id: string }>(
      "INSERT INTO calendar_sources (user_id, name, url) VALUES ($1, $2, $3) RETURNING id", [userId, name, url]);
    id = rows[0]!.id;
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new HttpError(409, "Ce calendrier est déjà ajouté");
    throw err;
  }
  try {
    const result = await applyCalendar(id, userId, cal);
    res.status(201).json({ source: await getSource(id, userId), result });
  } catch (err) {
    await pool.query("DELETE FROM calendar_sources WHERE id = $1 AND user_id = $2", [id, userId]); // pas d'abonnement à moitié créé
    throw err;
  }
}));

// Déclaré avant /:id/sync pour la lisibilité ; les chemins ne se chevauchent pas.
calendarSourcesRouter.post("/sync-all", syncLimiter, ah(async (req, res) => {
  res.json(await syncAll(uid(req)));
}));

calendarSourcesRouter.post("/:id/sync", syncLimiter, ah(async (req, res) => {
  const userId = uid(req);
  const id = idSchema.parse(req.params.id);
  const result = await syncSource(id, userId);
  res.json({ source: await getSource(id, userId), result });
}));

calendarSourcesRouter.patch("/:id", ah(async (req, res) => {
  const userId = uid(req);
  const id = idSchema.parse(req.params.id);
  const { name } = updateSchema.parse(req.body);
  const { rowCount } = await pool.query("UPDATE calendar_sources SET name = $1 WHERE id = $2 AND user_id = $3", [name, id, userId]);
  if (!rowCount) throw new HttpError(404, "Calendrier introuvable");
  res.json(await getSource(id, userId));
}));

// ?delete_events=true supprime aussi les événements synchronisés ; sinon ils sont conservés.
calendarSourcesRouter.delete("/:id", ah(async (req, res) => {
  const userId = uid(req);
  const id = idSchema.parse(req.params.id);
  const { delete_events } = deleteQuery.parse(req.query);
  const found = await withTx(async (client) => {
    const r = await client.query("SELECT 1 FROM calendar_sources WHERE id = $1 AND user_id = $2 FOR UPDATE", [id, userId]);
    if (!r.rowCount) return false;
    if (delete_events === "true") await client.query("DELETE FROM calendar_events WHERE source_id = $1 AND user_id = $2", [id, userId]);
    await client.query("DELETE FROM calendar_sources WHERE id = $1 AND user_id = $2", [id, userId]);
    return true;
  });
  if (!found) throw new HttpError(404, "Calendrier introuvable");
  res.status(204).end();
}));