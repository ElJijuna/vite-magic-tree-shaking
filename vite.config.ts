import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function addShebang(): Plugin {
  return {
    name: 'add-shebang',
    generateBundle(_, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (fileName === 'cli.js' && chunk.type === 'chunk') {
          chunk.code = `#!/usr/bin/env node\n${chunk.code}`;
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [addShebang()],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        cli: resolve(__dirname, 'src/cli.ts'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['node:path', 'node:fs', 'node:url', 'vite'],
    },
  },
});
