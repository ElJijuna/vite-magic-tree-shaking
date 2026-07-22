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
import { viteMagic } from 'vite-magic-tree-shaking'

export default defineConfig({
  plugins: [viteMagic()],
  build: {
    rollupOptions: {
      external: ['react', 'react-dom'],
    },
  },
})
```

## Shared configuration

Create `vite-magic.config.ts` in the project root to share entry and export
settings between Vite and the CLI:

```ts
import { defineConfig } from 'vite-magic-tree-shaking'

export default defineConfig({
  rootDir: '.',
  srcDir: 'src',
  followSymlinks: false,
  exports: {
    formats: ['es', 'cjs'],
    outDir: 'dist',
    typesOutDir: 'dist',
    includeTypes: true,
  },
})
```

The CLI discovers this file automatically. Command-line options override its
values, and an alternative file can be selected with `--config <path>`.

### Automatic Vite plugin

Add `viteMagic()` to `vite.config.ts`. It discovers the shared config and fills
`build.lib.entry` automatically:

```ts
import { defineConfig } from 'vite'
import { viteMagic } from 'vite-magic-tree-shaking'

export default defineConfig({
  plugins: [viteMagic()],
  build: {
    rollupOptions: {
      external: ['react', 'react-dom'],
    },
  },
})
```

The shared config is the single source of truth:

| Shared value | Used by Vite | Used by CLI/export map |
| --- | --- | --- |
| `srcDir` | Entries and `preserveModulesRoot` | Source scanning |
| `exports.formats` | `build.lib.formats` | `import`/`require` conditions |
| `exports.outDir` | `build.outDir` | JavaScript package targets |
| Export extensions | `build.lib.fileName` | JavaScript package targets |
| `exports.typesOutDir` | Declaration-tool input | TypeScript package targets |

Additional library options can still be provided without duplicating generated
values:

```ts
viteMagic({
  library: {
    name: 'MyLibrary',
    cssFileName: 'styles',
  },
})
```

Remove manual `build.lib.entry`, `build.lib.formats`, `build.lib.fileName`,
`build.outDir`, and `preserveModulesRoot` when using the plugin. Inline options
passed to `viteMagic()` override values from `vite-magic.config.ts`.

Vite does not emit declarations itself. A declaration plugin can read
`magicConfig.exports?.typesOutDir` from the same config instead of repeating the
path value.

### Manual Vite integration

If a plugin is not desired, import the same config from `vite.config.ts` and
generate the entry map directly:

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { generateEntriesFromConfig } from 'vite-magic-tree-shaking'
import magicConfig from './vite-magic.config'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  build: {
    lib: {
      entry: generateEntriesFromConfig(magicConfig, rootDir),
    },
  },
})
```

### Warn when `package.json` exports are out of sync

Pass `warnOnExportsMismatch: true` to get a `console.warn` at build/dev time if
the `exports` field in `package.json` does not match the entries resolved from
your source directory:

```ts
entry: generateEntries(__dirname, 'src', {
  warnOnExportsMismatch: true,
  exports: { formats: ['es', 'cjs'] },
})
```

```text
[vite-magic-tree-shaking] package.json exports are out of sync with src entries.
Run: npx vite-magic-tree-shaking generate
```

## CLI

The package ships a `vite-magic` binary with two commands.

### `generate`

Reads your source directory, derives the entry map, and safely merges matching
entries into the `exports` field in `package.json`. Existing custom exports are
preserved unless `--prune` is passed explicitly.

```bash
# using npx (no install required)
npx vite-magic-tree-shaking generate

# custom rootDir and srcDir
npx vite-magic-tree-shaking generate /path/to/project lib

# project emits ES modules only
npx vite-magic-tree-shaking generate --formats es

# preview without modifying package.json
npx vite-magic-tree-shaking generate --dry-run
```

Example output:

```text
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
npx vite-magic-tree-shaking validate

# also reject custom exports not generated from source
npx vite-magic-tree-shaking validate --strict
```

Example output when in sync:

```text
✓ package.json exports are in sync
```

Example output from strict validation when out of sync:

```text
✗ package.json exports are out of sync with src entries
  Missing : ./NewFeature
  Extra   : ./OldFeature
  Changed : ./Users

Run: npx vite-magic-tree-shaking generate
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

### CLI options

| Option | Purpose |
| --- | --- |
| `--config <path>` | Use a custom config file instead of `vite-magic.config.ts` |
| `--formats es,cjs` | Match the formats emitted by Vite |
| `--out-dir dist` | Set the JavaScript output directory |
| `--types-dir dist` | Set the declaration output directory |
| `--no-types` | Omit TypeScript declaration conditions |
| `--dry-run` | Preview changes without writing |
| `--prune` | Explicitly remove exports not generated from source |
| `--strict` | Make `validate` reject additional custom exports |

## How entries are resolved

Given this structure:

```text
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
      "types": "./dist/Users/index.d.ts",
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
| --- | --- |
| `src/index.ts` | `index` |
| `src/Users/index.ts` | `Users` |
| `src/Button/Button.tsx` (no index in dir) | `Button/Button` |
| `src/Users/domain/user.ts` (subdir of indexed dir) | `Users/domain/user` |

Directories with an `index` file use the **directory name** as key. Their
subdirectories are still scanned recursively.

Directories without an `index` expose **each file individually** using its
relative path (without extension).

Symbolic links are ignored by default. Set `followSymlinks: true` to follow links
whose resolved target remains inside the source directory. Duplicate entry keys
and multiple `index` files fail with a descriptive error instead of silently
overwriting an entry.

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
| --- | --- | --- | --- |
| `rootDir` | `string` | — | Absolute path to the project root |
| `srcDir` | `string` | `'src'` | Source directory name, relative to `rootDir` |
| `options` | `GenerateEntriesOptions` | `{}` | Optional configuration |

### `GenerateEntriesOptions`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `warnOnExportsMismatch` | `boolean` | `false` | Emit a `console.warn` if `package.json` exports do not match the resolved entries |
| `followSymlinks` | `boolean` | `false` | Follow links that stay inside `srcDir` |
| `include` | `(path: string) => boolean` | — | Include matching valid source files |
| `exclude` | `(path: string) => boolean` | — | Exclude matching files or directories |
| `onCollision` | `'error' \| 'overwrite'` | `'error'` | Choose how duplicate keys are handled |
| `exports` | `ExportsOptions` | `{}` | Output contract used by mismatch warnings |

### Export-map API

```ts
entryRecordToExports(entries, {
  sourceRoot: '/project/src',
  formats: ['es'],
  outDir: 'dist',
  typesOutDir: 'dist',
})
```

The generated conditions only include formats that the build emits. Declaration
paths retain the source layout, so `src/Users/index.ts` correctly maps to
`dist/Users/index.d.ts`.

## License

MIT
