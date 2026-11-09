import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 1. Spécifier qu'on est sur un backend Node
    environment: 'node',

    // 2. Utiliser 'forks' au lieu des threads pour éviter les crashs avec sharp et la BDD
    pool: 'forks',

    // 3. Forcer Vitest à ignorer les fichiers binaires de ces bibliothèques
    server: {
      deps: {
        external: ['sharp', 'pg', 'sql.js', 'pdfkit', 'fflate']
      }
    },

    // 4. (Optionnel) T'assurer que tes chemins sont bien définis
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.git/**']
  }
})