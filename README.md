# vite-magic-tree-shaking

[![npm version](https://img.shields.io/npm/v/vite-magic-tree-shaking?color=crimson&label=npm)](https://www.npmjs.com/package/vite-magic-tree-shaking)
[![npm downloads](https://img.shields.io/npm/dm/vite-magic-tree-shaking?color=orange)](https://www.npmjs.com/package/vite-magic-tree-shaking)
[![license](https://img.shields.io/npm/l/vite-magic-tree-shaking?color=blue)](https://github.com/ElJijuna/vite-magic-tree-shaking/blob/main/LICENSE)
[![CI](https://github.com/ElJijuna/vite-magic-tree-shaking/actions/workflows/publish.yml/badge.svg)](https://github.com/ElJijuna/vite-magic-tree-shaking/actions/workflows/publish.yml)

Auto-generate tree-shakeable `build.lib.entry` for Vite from your source directory.

## Install

```bash
npm install -D vite-magic-tree-shaking
```

## Usage

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { generateEntries } from 'vite-magic-tree-shaking'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  build: {
    lib: {
      entry: generateEntries(__dirname),       // scans src/ by default
      // entry: generateEntries(__dirname, 'lib'), // custom source dir
      formats: ['es'],
      fileName: (_, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
      },
    },
  },
})
```

## How entries are resolved

Given this structure:

```
src/
├── index.ts
├── Users/
│   ├── index.ts
│   ├── domain/
│   │   └── user.ts
│   └── types/
│       └── UserDTO.ts
└── Button/
    └── Button.tsx
```

`generateEntries(__dirname)` produces:

```ts
{
  index:                 '/abs/src/index.ts',
  Users:                 '/abs/src/Users/index.ts',
  'Users/domain/user':   '/abs/src/Users/domain/user.ts',
  'Users/types/UserDTO': '/abs/src/Users/types/UserDTO.ts',
  'Button/Button':       '/abs/src/Button/Button.tsx',
}
```

### Rules

| Source | Entry key |
|---|---|
| `src/index.ts` | `index` |
| `src/Users/index.ts` | `Users` |
| `src/Button/Button.tsx` (no index in dir) | `Button/Button` |
| `src/Users/domain/user.ts` (subdir of indexed dir) | `Users/domain/user` |

Directories with an `index` file use the **directory name** as key. Their subdirectories are still scanned recursively.

Directories without an `index` expose **each file individually** using its relative path (without extension).

### Ignored files

The following are never included as entries:

- `*.test.ts` / `*.spec.ts`
- `*.stories.tsx`
- `*.d.ts` / `*.d.mts` / `*.d.cts`
- Any file with an extension other than `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`

## API

```ts
generateEntries(rootDir: string, srcDir?: string): Record<string, string>
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `rootDir` | `string` | — | Absolute path to the project root |
| `srcDir` | `string` | `'src'` | Source directory name, relative to `rootDir` |

## License

MIT
