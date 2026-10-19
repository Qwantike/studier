import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";

// Le .env se trouve à la racine du dépôt (deux niveaux au-dessus de src/).
const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "../../.env") });

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL est requis"),
  PORT: z.coerce.number().int().positive().default(3001),
  // Intervalle de synchronisation des calendriers par URL, en minutes (0 = désactivée).
  CALENDAR_SYNC_MINUTES: z.coerce.number().int().min(0).default(60),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Configuration invalide :", parsed.error.flatten().fieldErrors);
  console.error("Copiez .env.example vers .env et adaptez-le.");
  process.exit(1);
}

export const env = parsed.data;
export const MIGRATIONS_DIR = path.resolve(here, "migrations");
