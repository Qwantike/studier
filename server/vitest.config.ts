import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["src/__tests__/**/*.test.ts"],
        globalSetup: ["src/__tests__/globalSetup.ts"],
        setupFiles: ["src/__tests__/setup.ts"],
        // Tous les fichiers partagent la même base de test : on les exécute l'un après l'autre.
        fileParallelism: false,
        testTimeout: 20_000,
        hookTimeout: 30_000,
    },
});