import { Router, type RequestHandler } from "express";
import { z, type ZodObject, type ZodRawShape } from "zod";
import { pool } from "../db/pool.js";
import { HttpError } from "../errors.js";

export const idSchema = z.string().uuid("Identifiant invalide");
const reorderSchema = z.object({ ids: z.array(idSchema).min(1) });

export interface CrudConfig {
  table: string;
  /** Colonne de la clé étrangère parente (filtre de liste et calcul de position). */
  parentColumn?: string;
  /** Schéma de création ; le schéma de mise à jour en est la version partielle. */
  create: ZodObject<ZodRawShape>;
  /** Colonnes renvoyées (hors GET /:id qui renvoie tout). */
  columns?: string;
}

// Express 4 ne capte pas les promesses rejetées : on les transmet à next().
export const ah = (fn: RequestHandler): RequestHandler => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Les noms de colonnes viennent des clés du schéma zod (liste blanche), jamais du client.
const defined = (o: Record<string, unknown>) =>
  Object.entries(o).filter(([, v]) => v !== undefined);

export function crudRouter(cfg: CrudConfig): Router {
  const { table, parentColumn, create } = cfg;
  const update = create.partial();
  const cols = cfg.columns ?? "*";
  const r = Router();

  r.get("/", ah(async (req, res) => {
    const params: unknown[] = [];
    let where = "";
    if (parentColumn && req.query[parentColumn] !== undefined) {
      params.push(idSchema.parse(req.query[parentColumn]));
      where = `WHERE ${parentColumn} = $1`;
    }
    const { rows } = await pool.query(
      `SELECT ${cols} FROM ${table} ${where} ORDER BY position, created_at`, params);
    res.json(rows);
  }));

  // Déclaré avant /:id pour ne pas être capté par lui.
  r.post("/reorder", ah(async (req, res) => {
    const { ids } = reorderSchema.parse(req.body);
    await pool.query(
      `UPDATE ${table} t SET position = v.pos
       FROM unnest($1::uuid[]) WITH ORDINALITY AS v(id, pos) WHERE t.id = v.id`, [ids]);
    res.status(204).end();
  }));

  r.get("/:id", ah(async (req, res) => {
    const { rows } = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [idSchema.parse(req.params.id)]);
    if (!rows[0]) throw new HttpError(404, "Élément introuvable");
    res.json(rows[0]);
  }));

  r.post("/", ah(async (req, res) => {
    const entries = defined(create.parse(req.body));
    const names = entries.map(([k]) => k);
    const values = entries.map(([, v]) => v);
    // Nouvel élément ajouté à la fin de sa fratrie.
    const parentIdx = parentColumn ? names.indexOf(parentColumn) : -1;
    const position = parentIdx >= 0
      ? `(SELECT COALESCE(MAX(position) + 1, 0) FROM ${table} WHERE ${parentColumn} = $${parentIdx + 1})`
      : `(SELECT COALESCE(MAX(position) + 1, 0) FROM ${table})`;
    const placeholders = names.map((_, i) => `$${i + 1}`);
    try {
      const { rows } = await pool.query(
        `INSERT INTO ${table} (${[...names, "position"].join(", ")})
         VALUES (${[...placeholders, position].join(", ")}) RETURNING ${cols}`, values);
      res.status(201).json(rows[0]);
    } catch (err) {
      if ((err as { code?: string }).code === "23503") throw new HttpError(400, "Parent introuvable");
      throw err;
    }
  }));

  r.patch("/:id", ah(async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const entries = defined(update.parse(req.body));
    if (entries.length === 0) throw new HttpError(400, "Aucun champ à modifier");
    const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(", ");
    const { rows } = await pool.query(
      `UPDATE ${table} SET ${sets} WHERE id = $${entries.length + 1} RETURNING ${cols}`,
      [...entries.map(([, v]) => v), id]);
    if (!rows[0]) throw new HttpError(404, "Élément introuvable");
    res.json(rows[0]);
  }));

  r.delete("/:id", ah(async (req, res) => {
    const { rowCount } = await pool.query(`DELETE FROM ${table} WHERE id = $1`, [idSchema.parse(req.params.id)]);
    if (!rowCount) throw new HttpError(404, "Élément introuvable");
    res.status(204).end();
  }));

  return r;
}
