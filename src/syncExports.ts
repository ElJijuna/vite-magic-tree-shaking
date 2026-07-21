import {
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, extname, isAbsolute, posix, relative, resolve } from 'node:path'
import type { EntryRecord } from './generateEntries.js'

export type ExportConditions = {
  types?: string
  import?: string
  require?: string
}

export type ExportsMap = Record<string, ExportConditions>

export type ExportFormat = 'es' | 'cjs'

export type ExportsOptions = {
  /** Absolute source directory used to map declaration output paths. */
  sourceRoot?: string
  /** JavaScript output directory relative to the package root. @default 'dist' */
  outDir?: string
  /** Declaration output directory relative to the package root. Defaults to `outDir`. */
  typesOutDir?: string
  /** JavaScript formats emitted by the build. @default ['es', 'cjs'] */
  formats?: readonly ExportFormat[]
  /** Include TypeScript declaration conditions. @default true */
  includeTypes?: boolean
  /** ES module file extension. @default '.js' */
  importExtension?: string
  /** CommonJS file extension. @default '.cjs' */
  requireExtension?: string
}

export type ExportsComparisonOptions = {
  /** Ignore export keys not managed by the generated map. @default false */
  allowExtra?: boolean
}

function normaliseRelativeOutputPath(path: string, optionName: string): string {
  const normalised = path.replace(/\\/g, '/').replace(/^\.\//, '')
  if (!normalised || isAbsolute(path) || normalised === '..' || normalised.startsWith('../')) {
    throw new Error(`${optionName} must be a non-empty path inside the package`)
  }
  return normalised.replace(/\/$/, '')
}

function packageTarget(...parts: string[]): string {
  return `./${posix.join(...parts)}`
}

function declarationExtension(sourcePath: string): string {
  const extension = extname(sourcePath)
  if (extension === '.mts') return '.d.mts'
  if (extension === '.cts') return '.d.cts'
  return '.d.ts'
}

function declarationPath(key: string, sourcePath: string, options: ExportsOptions): string {
  const typesOutDir = normaliseRelativeOutputPath(
    options.typesOutDir ?? options.outDir ?? 'dist',
    'typesOutDir'
  )
  let sourceRelativePath = key

  if (options.sourceRoot) {
    sourceRelativePath = relative(options.sourceRoot, sourcePath).replace(/\\/g, '/')
    if (
      isAbsolute(sourceRelativePath) ||
      sourceRelativePath === '..' ||
      sourceRelativePath.startsWith('../')
    ) {
      throw new Error(`Entry is outside sourceRoot: ${sourcePath}`)
    }
  }

  const extension = extname(sourceRelativePath)
  const withoutExtension = extension
    ? sourceRelativePath.slice(0, -extension.length)
    : sourceRelativePath
  return packageTarget(typesOutDir, `${withoutExtension}${declarationExtension(sourcePath)}`)
}

export function entryRecordToExports(
  entries: EntryRecord,
  options: ExportsOptions = {}
): ExportsMap {
  const result = Object.create(null) as ExportsMap
  const outDir = normaliseRelativeOutputPath(options.outDir ?? 'dist', 'outDir')
  const formats = new Set(options.formats ?? ['es', 'cjs'])
  const importExtension = options.importExtension ?? '.js'
  const requireExtension = options.requireExtension ?? '.cjs'

  for (const key of Object.keys(entries).sort()) {
    const exportKey = key === 'index' ? '.' : `./${key}`
    const conditions: ExportConditions = {}
    if (options.includeTypes !== false) {
      conditions.types = declarationPath(key, entries[key], options)
    }
    if (formats.has('es')) {
      conditions.import = packageTarget(outDir, `${key}${importExtension}`)
    }
    if (formats.has('cjs')) {
      conditions.require = packageTarget(outDir, `${key}${requireExtension}`)
    }
    result[exportKey] = conditions
  }
  return result
}

export function readPackageJson(rootDir: string): Record<string, unknown> {
  const pkgPath = resolve(rootDir, 'package.json')
  const parsed = JSON.parse(readFileSync(pkgPath, 'utf-8')) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`package.json must contain a JSON object: ${pkgPath}`)
  }
  return parsed as Record<string, unknown>
}

export function writePackageJson(rootDir: string, pkg: Record<string, unknown>): void {
  const pkgPath = resolve(rootDir, 'package.json')
  const original = readFileSync(pkgPath, 'utf-8')
  const indentMatch = original.match(/\n([ \t]+)"/)
  const indent = indentMatch?.[1] ?? '  '
  const finalNewline = original.endsWith('\n') ? '\n' : ''
  const temporaryPath = resolve(
    dirname(pkgPath),
    `.${basename(pkgPath)}.${process.pid}.${Date.now()}.tmp`
  )

  try {
    writeFileSync(temporaryPath, JSON.stringify(pkg, null, indent) + finalNewline, {
      encoding: 'utf-8',
      flag: 'wx',
      mode: statSync(pkgPath).mode,
    })
    renameSync(temporaryPath, pkgPath)
  } catch (error) {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath)
    throw error
  }
}

export function exportsAreSynced(
  current: unknown,
  expected: Record<string, unknown>,
  options: ExportsComparisonOptions = {}
): boolean {
  const difference = diffExports(current, expected)
  return (
    difference.missing.length === 0 &&
    difference.changed.length === 0 &&
    (options.allowExtra === true || difference.extra.length === 0)
  )
}

export type ExportsDiff = {
  missing: string[]
  extra: string[]
  changed: string[]
}

export function diffExports(
  current: unknown,
  expected: Record<string, unknown>
): ExportsDiff {
  const cur = (
    current && typeof current === 'object' && !Array.isArray(current) ? current : {}
  ) as Record<string, unknown>
  const missing: string[] = []
  const extra: string[] = []
  const changed: string[] = []

  for (const key of Object.keys(expected)) {
    if (!(key in cur)) {
      missing.push(key)
    } else if (JSON.stringify(cur[key]) !== JSON.stringify(expected[key])) {
      changed.push(key)
    }
  }

  for (const key of Object.keys(cur)) {
    if (!(key in expected)) {
      extra.push(key)
    }
  }

  return { missing, extra, changed }
}

export function mergeExports(
  current: unknown,
  expected: ExportsMap,
  options: { prune?: boolean } = {}
): Record<string, unknown> {
  const currentMap = (
    current && typeof current === 'object' && !Array.isArray(current) ? current : {}
  ) as Record<string, unknown>
  const merged = Object.create(null) as Record<string, unknown>

  if (!options.prune) {
    for (const key of Object.keys(currentMap)) merged[key] = currentMap[key]
  }
  for (const key of Object.keys(expected)) merged[key] = expected[key]
  return merged
}
