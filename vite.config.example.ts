/**
 * Example: how to use generateEntries in your own project's vite.config.ts
 *
 * Given this src/ structure:
 *
 *   src/
 *   ├── index.ts
 *   ├── Users/
 *   │   ├── index.ts          ← dir has index → key "Users"
 *   │   ├── domain/
 *   │   │   └── user.ts       ← subdir → key "Users/domain/user"
 *   │   └── types/
 *   │       └── UserDTO.ts    ← subdir → key "Users/types/UserDTO"
 *   └── utils/
 *       └── utils.ts          ← no index → key "utils/utils"
 *
 * generateEntries(__dirname, 'src') produces:
 *   {
 *     index:                  '/abs/path/src/index.ts',
 *     Users:                  '/abs/path/src/Users/index.ts',
 *     'Users/domain/user':    '/abs/path/src/Users/domain/user.ts',
 *     'Users/types/UserDTO':  '/abs/path/src/Users/types/UserDTO.ts',
 *     'utils/utils':          '/abs/path/src/utils/utils.ts',
 *   }
 */

import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { generateEntries } from 'vite-magic-tree-shaking'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  build: {
    lib: {
      entry: generateEntries(__dirname, 'src'), // 'src' is the default
      formats: ['es', 'cjs'],
      fileName: (format, entryName) =>
        `${entryName}.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        preserveModules: true, // keeps the directory tree in dist/
        preserveModulesRoot: 'src',
      },
    },
  },
})
