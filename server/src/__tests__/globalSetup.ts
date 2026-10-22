import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { testDatabaseUrl } from "./testEnv.js";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Avant tous les tests : base de test remise à zéro, puis toutes les migrations appliquées.
export default async function setup(): Promise<void> {
    const url = testDatabaseUrl();
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
        await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    } finally {
        await client.end();
    }
    execSync("npx tsx src/db/migrate.ts", {
        cwd: serverDir, stdio: "pipe",
        env: { ...process.env, DATABASE_URL: url, JWT_SECRET: "x".repeat(40) },
    });
}