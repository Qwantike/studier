import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { pool, withTx } from "../db/pool.js";
import { HttpError } from "../errors.js";
import { getEvent, listEventsBetween } from "../services/calendarEvents.js";
import { eventsFromCalendar, focusDate, parseIcsText, upsertEvents, type IcsEvent } from "../services/ics.js";
import { ah, idSchema } from "./crud.js";

const isoDate = z.string().datetime({ offset: true, message: "Date/heure invalide" });
const eventBase = z.object({
  title: z.string().trim().min(1, "Le titre est requis").max(300),
  starts_at: isoDate,
  ends_at: isoDate,
  location: z.string().trim().max(300).nullable().optional(),
  subject_id: idSchema.nullable().optional(),
});
const createSchema = eventBase.refine((e) => Date.parse(e.ends_at) >= Date.parse(e.starts_at), {
  message: "La fin doit être après le début", path: ["ends_at"],
});
const updateSchema = eventBase.partial();
const rangeSchema = z.object({ from: isoDate, to: isoDate });

const defined = (o: Record<string, unknown>) => Object.entries(o).filter(([, v]) => v !== undefined);

async function fkAs400<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (err) {
    if ((err as { code?: string }).code === "23503") throw new HttpError(400, "Matière introuvable");
    throw err;
  }
}

const MAX_ICS_BYTES = 5 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ICS_BYTES } });

export const calendarRouter = Router();

// Import d'un fichier .ics (multipart, champ « file »).
calendarRouter.post(
  "/calendar/import",
  (req, res, next) => upload.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    const tooBig = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE";
    next(new HttpError(400, tooBig ? "Fichier trop volumineux (5 Mo maximum)" : "Fichier invalide"));
  }),
  ah(async (req, res) => {
    if (!req.file) throw new HttpError(400, "Aucun fichier reçu (champ « file » attendu)");
    const cal = parseIcsText(req.file.buffer.toString("utf8").replace(/^\uFEFF/, ""));

    let events: IcsEvent[];
    try { events = eventsFromCalendar(cal); } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, "Impossible de lire ce fichier .ics");
    }
    const { created, updated } = await withTx((client) => upsertEvents(client, events, null));
    res.json({ created, updated, unchanged: events.length - created - updated, focus_date: focusDate(events) });
  }),
);

// Annule les imports : supprime uniquement les événements issus d'un .ics (fichier ou abonnement).
calendarRouter.delete("/calendar/imported", ah(async (_req, res) => {
  const { rowCount } = await pool.query("DELETE FROM calendar_events WHERE ics_uid IS NOT NULL");
  res.json({ deleted: rowCount ?? 0 });
}));

calendarRouter.get("/calendar-events", ah(async (req, res) => {
  const { from, to } = rangeSchema.parse(req.query);
  res.json(await listEventsBetween(from, to));
}));

calendarRouter.post("/calendar-events", ah(async (req, res) => {
  const entries = defined(createSchema.parse(req.body));
  const { rows } = await fkAs400(() => pool.query<{ id: string }>(
    `INSERT INTO calendar_events (${entries.map(([k]) => k).join(", ")})
     VALUES (${entries.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
    entries.map(([, v]) => v)));
  res.status(201).json(await getEvent(rows[0]!.id));
}));

calendarRouter.patch("/calendar-events/:id", ah(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const entries = defined(updateSchema.parse(req.body));
  if (entries.length === 0) throw new HttpError(400, "Aucun champ à modifier");
  const cur = await getEvent(id);
  if (!cur) throw new HttpError(404, "Événement introuvable");

  // La cohérence début/fin se vérifie sur les valeurs finales (anciennes + nouvelles).
  const patch = Object.fromEntries(entries) as Record<string, unknown>;
  const start = Date.parse(String(patch.starts_at ?? new Date(cur.starts_at).toISOString()));
  const end = Date.parse(String(patch.ends_at ?? new Date(cur.ends_at).toISOString()));
  if (end < start) throw new HttpError(400, "La fin doit être après le début");

  await fkAs400(() => pool.query(
    `UPDATE calendar_events SET ${entries.map(([k], i) => `${k} = $${i + 1}`).join(", ")} WHERE id = $${entries.length + 1}`,
    [...entries.map(([, v]) => v), id]));
  res.json(await getEvent(id));
}));

calendarRouter.delete("/calendar-events/:id", ah(async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM calendar_events WHERE id = $1", [idSchema.parse(req.params.id)]);
  if (!rowCount) throw new HttpError(404, "Événement introuvable");
  res.status(204).end();
}));
