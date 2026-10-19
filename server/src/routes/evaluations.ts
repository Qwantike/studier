import { Router } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { pool, withTx } from "../db/pool.js";
import { HttpError } from "../errors.js";
import { ah, idSchema } from "./crud.js";

const EVAL_TYPES = ["controle", "projet", "examen", "autre"] as const;

// Refuse aussi les dates impossibles comme 2026-02-31 (JS les "corrige", d'où l'aller-retour).
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (AAAA-MM-JJ)")
  .refine((s) => new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s, "Date inexistante");

const base = z.object({
  subject_id: idSchema,
  title: z.string().trim().min(1, "Le titre est requis").max(200),
  type: z.enum(EVAL_TYPES).optional(),
  date: dateStr,
  coefficient: z.number().nonnegative().max(999).nullable().optional(),
  grade: z.number().min(0, "La note doit être entre 0 et 20").max(20, "La note doit être entre 0 et 20").nullable().optional(),
  chapter_ids: z.array(idSchema).max(500).optional(),
});
const createSchema = base;
const updateSchema = base.partial();

// Évaluation + matière + progression (chapitres "revised" / chapitres liés).
export const LIST_SQL = `
  SELECT e.id, e.subject_id, e.title, e.type, e.date, e.coefficient, e.grade,
         s.name AS subject_name, s.color AS subject_color,
         COUNT(c.id)::int AS chapter_total,
         (COUNT(c.id) FILTER (WHERE c.status = 'revised'))::int AS chapter_revised
  FROM evaluations e
  JOIN subjects s ON s.id = e.subject_id
  LEFT JOIN evaluation_chapters ec ON ec.evaluation_id = e.id
  LEFT JOIN chapters c ON c.id = ec.chapter_id`;
export const GROUP_SQL = "GROUP BY e.id, s.name, s.color ORDER BY e.date, e.created_at";

async function getDetail(id: string) {
  const ev = await pool.query(`${LIST_SQL} WHERE e.id = $1 ${GROUP_SQL}`, [id]);
  if (!ev.rows[0]) return null;
  const ch = await pool.query(
    `SELECT c.id, c.title, c.status, c.position, c.subject_id
     FROM evaluation_chapters ec JOIN chapters c ON c.id = ec.chapter_id
     WHERE ec.evaluation_id = $1 ORDER BY c.position, c.created_at`, [id]);
  return { ...ev.rows[0], chapters: ch.rows };
}

// Remplace les chapitres liés ; chacun doit appartenir à la matière de l'évaluation.
async function setLinks(client: PoolClient, evaluationId: string, subjectId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length > 0) {
    const { rowCount } = await client.query(
      "SELECT 1 FROM chapters WHERE id = ANY($1::uuid[]) AND subject_id = $2", [unique, subjectId]);
    if (rowCount !== unique.length) throw new HttpError(400, "Un chapitre n'appartient pas à la matière de l'évaluation");
  }
  await client.query("DELETE FROM evaluation_chapters WHERE evaluation_id = $1", [evaluationId]);
  if (unique.length > 0) {
    await client.query(
      "INSERT INTO evaluation_chapters (evaluation_id, chapter_id) SELECT $1::uuid, unnest($2::uuid[])",
      [evaluationId, unique]);
  }
}

const defined = (o: Record<string, unknown>) => Object.entries(o).filter(([, v]) => v !== undefined);

// Une clé étrangère invalide (matière inexistante) devient une erreur 400 lisible.
async function fkAs400<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (err) {
    if ((err as { code?: string }).code === "23503") throw new HttpError(400, "Matière introuvable");
    throw err;
  }
}

export const evaluationsRouter = Router();

// Filtres : ?subject_id=… et/ou ?chapter_id=… (évaluations qui concernent ce chapitre).
evaluationsRouter.get("/", ah(async (req, res) => {
  const where: string[] = [];
  const params: string[] = [];
  if (req.query.subject_id !== undefined) {
    params.push(idSchema.parse(req.query.subject_id));
    where.push(`e.subject_id = $${params.length}`);
  }
  if (req.query.chapter_id !== undefined) {
    params.push(idSchema.parse(req.query.chapter_id));
    where.push(`e.id IN (SELECT evaluation_id FROM evaluation_chapters WHERE chapter_id = $${params.length})`);
  }
  const { rows } = await pool.query(
    `${LIST_SQL} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ${GROUP_SQL}`, params);
  res.json(rows);
}));

evaluationsRouter.get("/:id", ah(async (req, res) => {
  const detail = await getDetail(idSchema.parse(req.params.id));
  if (!detail) throw new HttpError(404, "Évaluation introuvable");
  res.json(detail);
}));

evaluationsRouter.post("/", ah(async (req, res) => {
  const { chapter_ids, ...fields } = createSchema.parse(req.body);
  const entries = defined(fields);
  const id = await fkAs400(() => withTx(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO evaluations (${entries.map(([k]) => k).join(", ")})
       VALUES (${entries.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
      entries.map(([, v]) => v));
    const newId = rows[0]!.id;
    await setLinks(client, newId, fields.subject_id, chapter_ids ?? []);
    return newId;
  }));
  res.status(201).json(await getDetail(id));
}));

evaluationsRouter.patch("/:id", ah(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const { chapter_ids, ...fields } = updateSchema.parse(req.body);
  const entries = defined(fields);
  if (entries.length === 0 && chapter_ids === undefined) throw new HttpError(400, "Aucun champ à modifier");

  await fkAs400(() => withTx(async (client) => {
    const cur = await client.query<{ subject_id: string }>(
      "SELECT subject_id FROM evaluations WHERE id = $1 FOR UPDATE", [id]);
    if (!cur.rows[0]) throw new HttpError(404, "Évaluation introuvable");
    if (entries.length > 0) {
      await client.query(
        `UPDATE evaluations SET ${entries.map(([k], i) => `${k} = $${i + 1}`).join(", ")} WHERE id = $${entries.length + 1}`,
        [...entries.map(([, v]) => v), id]);
    }
    const subjectId = fields.subject_id ?? cur.rows[0].subject_id;
    if (chapter_ids !== undefined) {
      await setLinks(client, id, subjectId, chapter_ids);
    } else if (fields.subject_id) {
      // Matière changée sans nouvelle sélection : on retire les liens devenus incohérents.
      await client.query(
        `DELETE FROM evaluation_chapters ec USING chapters ch
         WHERE ec.chapter_id = ch.id AND ec.evaluation_id = $1 AND ch.subject_id <> $2`, [id, subjectId]);
    }
  }));
  res.json(await getDetail(id));
}));

evaluationsRouter.delete("/:id", ah(async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM evaluations WHERE id = $1", [idSchema.parse(req.params.id)]);
  if (!rowCount) throw new HttpError(404, "Évaluation introuvable");
  res.status(204).end();
}));
