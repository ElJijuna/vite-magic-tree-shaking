import { resolve, relative, join, extname } from 'node:path'
import { readdirSync, statSync, existsSync } from 'node:fs'
import { entryRecordToExports, exportsAreSynced, readPackageJson } from './syncExports.js'

export type EntryRecord = Record<string, string>

export interface GenerateEntriesOptions {
  /**
   * When `true`, compares the generated entries against `package.json` exports
   * and emits a `console.warn` if they are out of sync.
   *
   * Useful in `vite.config.ts` to catch forgotten `vite-magic generate` runs
   * at build/dev time.
   *
   * @default false
   */
  warnOnExportsMismatch?: boolean
}

const VALID_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts']

const IGNORE_SUFFIXES = [
  '.test.',
  '.spec.',
  '.stories.',
  '.d.ts',
  '.d.mts',
  '.d.cts',
]

function isValidEntryFile(name: string): boolean {
  const ext = extname(name)
  if (!VALID_EXTENSIONS.includes(ext)) return false
  return !IGNORE_SUFFIXES.some((suffix) => name.includes(suffix))
}

function findIndexFile(dirPath: string): string | null {
  for (const ext of VALID_EXTENSIONS) {
    const candidate = join(dirPath, `index${ext}`)
    if (existsSync(candidate)) return candidate
  }
  return null
}

function stripExtension(filePath: string): string {
  const ext = extname(filePath)
  return filePath.slice(0, -ext.length)
}

function scanDir(
  dirPath: string,
  absoluteSrc: string,
  entries: EntryRecord,
  isRoot: boolean
): void {
  const items = readdirSync(dirPath).sort()

  // Non-root directories: if an index exists, register it and only recurse into subdirs
  if (!isRoot) {
    const indexFile = findIndexFile(dirPath)
    if (indexFile) {
      // key = "Users" (the dir name relative to src root)
      const key = relative(absoluteSrc, dirPath)
      entries[key] = indexFile

      for (const item of items) {
        const itemPath = join(dirPath, item)
        if (statSync(itemPath).isDirectory()) {
          scanDir(itemPath, absoluteSrc, entries, false)
        }
      }
      return
    }
  }

  // Root or dirs without an index: register every valid file + recurse into subdirs
  for (const item of items) {
    const itemPath = join(dirPath, item)
    const stat = statSync(itemPath)

    if (stat.isDirectory()) {
      scanDir(itemPath, absoluteSrc, entries, false)
    } else if (isValidEntryFile(item)) {
      // key = "index" | "Users/Users" | "Users/domain/user"
      const rel = relative(absoluteSrc, itemPath)
      entries[stripExtension(rel)] = itemPath
    }
  }
}

/**
 * Generates a tree-shakeable entry map for Vite `build.lib.entry`.
 *
 * Rules (applied per directory inside `srcDir`):
 *  - `src/index.ts`               → `{ index: '…/src/index.ts' }`
 *  - `src/Users/index.ts`         → `{ Users: '…/src/Users/index.ts' }`
 *  - `src/Users/Users.tsx`        → `{ 'Users/Users': '…/src/Users/Users.tsx' }`
 *  - `src/Users/domain/user.ts`   → `{ 'Users/domain/user': '…/src/Users/domain/user.ts' }`
 *
 * @param rootDir  Absolute path to the project root (pass `__dirname` or
 *                 `fileURLToPath(new URL('.', import.meta.url))`)
 * @param srcDir   Source directory name relative to `rootDir` (default: `'src'`)
 * @param options  Optional configuration
 */
export function generateEntries(
  rootDir: string,
  srcDir: string = 'src',
  options: GenerateEntriesOptions = {}
): EntryRecord {
  const absoluteSrc = resolve(rootDir, srcDir)
  const entries: EntryRecord = {}
  scanDir(absoluteSrc, absoluteSrc, entries, true)

  if (options.warnOnExportsMismatch) {
    try {
      const pkg = readPackageJson(rootDir)
      const expected = entryRecordToExports(entries)
      if (!exportsAreSynced(pkg.exports, expected)) {
        console.warn(
          '[vite-magic-tree-shaking] package.json exports are out of sync with src entries.\n' +
          'Run: npx vite-magic generate'
        )
      }
    } catch {
      // silently skip if package.json is unreadable
    }
  }

  return entries
}
