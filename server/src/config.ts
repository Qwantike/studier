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
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  // Clé de signature des JWT : longue et aléatoire, jamais versionnée.
  JWT_SECRET: z.string().min(32, "JWT_SECRET doit faire au moins 32 caractères"),
  // Création de comptes ouverte à tous (false = seul le script user:claim / un futur système d'invitation).
  ALLOW_SIGNUP: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  // Origines autorisées pour CORS et la vérification CSRF (séparées par des virgules).
  APP_ORIGINS: z.string().default("http://localhost:5173")
    .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),
  // Autorise les abonnements vers des adresses privées/locales et tous les ports (tests en local uniquement !).
  CALENDAR_ALLOW_PRIVATE_URLS: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  // Nombre de proxys de confiance devant l'API (1 derrière Vercel/nginx) : requis pour que req.ip soit juste.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Configuration invalide :", parsed.error.flatten().fieldErrors);
  console.error("Copiez .env.example vers .env et adaptez-le.");
  process.exit(1);
}

export const env = parsed.data;
export const MIGRATIONS_DIR = path.resolve(here, "migrations");