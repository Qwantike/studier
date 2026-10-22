import { testDatabaseUrl } from "./testEnv.js";

// Exécuté avant chaque fichier de test, AVANT l'import de config.ts : l'application ne voit que la base de test.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.JWT_SECRET = "test-jwt-secret-".padEnd(48, "x");
process.env.NODE_ENV = "test";
process.env.ALLOW_SIGNUP = "true";
process.env.CALENDAR_SYNC_MINUTES = "60";
process.env.CALENDAR_ALLOW_PRIVATE_URLS = "true"; // pour joindre le serveur .ics local ; la suite SSRF le coupe
process.env.APP_ORIGINS = "http://localhost:5173";
process.env.TRUST_PROXY = "0";