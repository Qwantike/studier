import { Router, type RequestHandler } from "express";
import { z, type ZodObject, type ZodRawShape } from "zod";
import { pool } from "../db/pool.js";
import { HttpError } from "../errors.js";
import { uid } from "../middleware/auth.js";

export const idSchema = z.string().uuid("Identifiant invalide");
const reorderSchema = z.object({ ids: z.array(idSchema).min(1) });

export type OwnedTable = "years" | "semesters" | "subjects" | "chapters" | "evaluations";

export interface CrudConfig {
  table: OwnedTable;
  /** Colonne de la clé étrangère parente (filtre de liste et calcul de position). */
  parentColumn?: string;
  /** Table du parent : sert à vérifier qu'il appartient bien à l'utilisateur. */
  parentTable?: OwnedTable;
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

/** Refuse (400) une référence vers une ligne qui n'existe pas ou qui appartient à un autre utilisateur. */
export async function assertOwned(table: OwnedTable, id: string, userId: string, message: string): Promise<void> {
  const { rowCount } = await pool.query(`SELECT 1 FROM ${table} WHERE id = $1 AND user_id = $2`, [id, userId]);
  if (!rowCount) throw new HttpError(400, message);
}

export function crudRouter(cfg: CrudConfig): Router {
  const { table, parentColumn, parentTable, create } = cfg;
  const update = create.partial();
  const cols = cfg.columns ?? "*";
  const r = Router();

  const checkParent = async (values: Record<string, unknown>, userId: string) => {
    const pid = parentColumn ? values[parentColumn] : undefined;
    if (parentTable && typeof pid === "string") await assertOwned(parentTable, pid, userId, "Parent introuvable");
  };

  r.get("/", ah(async (req, res) => {
    const params: unknown[] = [uid(req)];
    let where = "WHERE user_id = $1";
    if (parentColumn && req.query[parentColumn] !== undefined) {
      params.push(idSchema.parse(req.query[parentColumn]));
      where += ` AND ${parentColumn} = $2`;
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
       FROM unnest($1::uuid[]) WITH ORDINALITY AS v(id, pos) WHERE t.id = v.id AND t.user_id = $2`,
      [ids, uid(req)]);
    res.status(204).end();
  }));

  r.get("/:id", ah(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT * FROM ${table} WHERE id = $1 AND user_id = $2`, [idSchema.parse(req.params.id), uid(req)]);
    if (!rows[0]) throw new HttpError(404, "Élément introuvable");
    res.json(rows[0]);
  }));

  r.post("/", ah(async (req, res) => {
    const userId = uid(req);
    const parsed = create.parse(req.body);
    await checkParent(parsed, userId);
    const entries = defined(parsed);
    const names = [...entries.map(([k]) => k), "user_id"];
    const values = [...entries.map(([, v]) => v), userId];
    // Nouvel élément ajouté à la fin de sa fratrie (celle de cet utilisateur).
    const parentIdx = parentColumn ? entries.findIndex(([k]) => k === parentColumn) : -1;
    const scope = parentIdx >= 0
      ? `user_id = $${values.length} AND ${parentColumn} = $${parentIdx + 1}`
      : `user_id = $${values.length}`;
    const position = `(SELECT COALESCE(MAX(position) + 1, 0) FROM ${table} WHERE ${scope})`;
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
    const userId = uid(req);
    const id = idSchema.parse(req.params.id);
    const parsed = update.parse(req.body);
    const entries = defined(parsed);
    if (entries.length === 0) throw new HttpError(400, "Aucun champ à modifier");
    await checkParent(parsed, userId); // un déplacement ne peut viser qu'un parent à soi
    const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(", ");
    const { rows } = await pool.query(
      `UPDATE ${table} SET ${sets} WHERE id = $${entries.length + 1} AND user_id = $${entries.length + 2} RETURNING ${cols}`,
      [...entries.map(([, v]) => v), id, userId]);
    if (!rows[0]) throw new HttpError(404, "Élément introuvable");
    res.json(rows[0]);
  }));

  r.delete("/:id", ah(async (req, res) => {
    const { rowCount } = await pool.query(
      `DELETE FROM ${table} WHERE id = $1 AND user_id = $2`, [idSchema.parse(req.params.id), uid(req)]);
    if (!rowCount) throw new HttpError(404, "Élément introuvable");
    res.status(204).end();
  }));

  return r;
}