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

### Warn when `package.json` exports are out of sync

Pass `warnOnExportsMismatch: true` to get a `console.warn` at build/dev time if
the `exports` field in `package.json` does not match the entries resolved from
your source directory:

```ts
entry: generateEntries(__dirname, 'src', { warnOnExportsMismatch: true })
```

```
[vite-magic-tree-shaking] package.json exports are out of sync with src entries.
Run: npx vite-magic generate
```

## CLI

The package ships a `vite-magic` binary with two commands.

### `generate`

Reads your source directory, derives the entry map, and writes the matching
`exports` field into `package.json`. Run this after adding or removing source
files.

```bash
# using npx (no install required)
npx vite-magic generate

# custom rootDir and srcDir
npx vite-magic generate /path/to/project lib
```

Example output:

```
✓ package.json exports updated:
  .
  ./Button/Button
  ./Users
  ./Users/domain/user
  ./Users/types/UserDTO
```

### `validate`

Checks that the `exports` field in `package.json` matches the entries derived
from the source directory. Exits with code `1` if they are out of sync — useful
in CI.

```bash
npx vite-magic validate
```

Example output when in sync:

```
✓ package.json exports are in sync
```

Example output when out of sync:

```
✗ package.json exports are out of sync with src entries
  Missing : ./NewFeature
  Extra   : ./OldFeature
  Changed : ./Users

Run: npx vite-magic generate
```

### Add to `package.json` scripts

```json
{
  "scripts": {
    "sync-exports": "vite-magic generate",
    "validate-exports": "vite-magic validate",
    "prebuild": "vite-magic validate"
  }
}
```

With `prebuild` wired up, running `npm run build` will abort with a clear error
if `package.json` exports are stale, before Vite even starts.

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

And `vite-magic generate` writes the corresponding `exports` to `package.json`:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./Users": {
      "types": "./dist/Users.d.ts",
      "import": "./dist/Users.js",
      "require": "./dist/Users.cjs"
    },
    "./Users/domain/user": {
      "types": "./dist/Users/domain/user.d.ts",
      "import": "./dist/Users/domain/user.js",
      "require": "./dist/Users/domain/user.cjs"
    },
    "./Users/types/UserDTO": {
      "types": "./dist/Users/types/UserDTO.d.ts",
      "import": "./dist/Users/types/UserDTO.js",
      "require": "./dist/Users/types/UserDTO.cjs"
    },
    "./Button/Button": {
      "types": "./dist/Button/Button.d.ts",
      "import": "./dist/Button/Button.js",
      "require": "./dist/Button/Button.cjs"
    }
  }
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
generateEntries(rootDir: string, srcDir?: string, options?: GenerateEntriesOptions): Record<string, string>
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `rootDir` | `string` | — | Absolute path to the project root |
| `srcDir` | `string` | `'src'` | Source directory name, relative to `rootDir` |
| `options` | `GenerateEntriesOptions` | `{}` | Optional configuration |

### `GenerateEntriesOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `warnOnExportsMismatch` | `boolean` | `false` | Emit a `console.warn` if `package.json` exports do not match the resolved entries |

## License

MIT
