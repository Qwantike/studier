import pg from "pg";
import { env } from "../config.js";

// numeric -> number, date -> chaîne "YYYY-MM-DD" (évite les décalages de fuseau).
pg.types.setTypeParser(1700, (v) => parseFloat(v));
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

// Évite un crash silencieux si une connexion inactive tombe.
pool.on("error", (err) => console.error("Erreur du pool PostgreSQL :", err.message));

// Exécute fn dans une transaction (COMMIT si tout réussit, sinon ROLLBACK).
export async function withTx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
