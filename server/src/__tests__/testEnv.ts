import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const dbName = (url: string) => decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));

/**
 * URL de la base de TEST. Les tests vident cette base à chaque lancement : on refuse donc de continuer
 * si elle ne s'appelle pas « …test… » ou si c'est la même base que DATABASE_URL (ta vraie base).
 */
export function testDatabaseUrl(): string {
    config({ path: path.resolve(here, "../../../.env") }); // .env à la racine du dépôt
    const url = process.env.TEST_DATABASE_URL;
    if (!url) {
        throw new Error("TEST_DATABASE_URL manquant. Ajoutez-le au .env, par exemple : postgresql://user:motdepasse@localhost:5432/etudes_test");
    }
    const name = dbName(url);
    if (!/test/i.test(name)) throw new Error(`Refus : la base « ${name} » n'a pas « test » dans son nom. Les tests la vident à chaque lancement.`);
    if (process.env.DATABASE_URL && dbName(process.env.DATABASE_URL) === name) {
        throw new Error("Refus : TEST_DATABASE_URL pointe vers la même base que DATABASE_URL.");
    }
    return url;
}