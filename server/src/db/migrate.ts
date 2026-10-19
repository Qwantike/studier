import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { MIGRATIONS_DIR } from "../config.js";
import { pool } from "./pool.js";

// Applique, dans l'ordre, les fichiers NNN_nom.sql pas encore enregistrés.
async function migrate(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);

  const { rows } = await pool.query<{ name: string }>("SELECT name FROM schema_migrations");
  const done = new Set(rows.map((r) => r.name));
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`✔ ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`Échec de la migration ${file} : ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  console.log("Migrations à jour.");
}

migrate()
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => pool.end());
