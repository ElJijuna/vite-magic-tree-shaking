import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { EntryRecord } from './generateEntries.js'

export type ExportConditions = {
  types: string
  import: string
  require: string
}

export type ExportsMap = Record<string, ExportConditions>

export function entryRecordToExports(entries: EntryRecord): ExportsMap {
  const result: ExportsMap = {}
  for (const key of Object.keys(entries).sort()) {
    const exportKey = key === 'index' ? '.' : `./${key}`
    result[exportKey] = {
      types: `./dist/${key}.d.ts`,
      import: `./dist/${key}.js`,
      require: `./dist/${key}.cjs`,
    }
  }
  return result
}

export function readPackageJson(rootDir: string): Record<string, unknown> {
  const pkgPath = resolve(rootDir, 'package.json')
  return JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>
}

export function writePackageJson(rootDir: string, pkg: Record<string, unknown>): void {
  const pkgPath = resolve(rootDir, 'package.json')
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
}

export function exportsAreSynced(current: unknown, expected: ExportsMap): boolean {
  return JSON.stringify(current) === JSON.stringify(expected)
}

export type ExportsDiff = {
  missing: string[]
  extra: string[]
  changed: string[]
}

export function diffExports(current: unknown, expected: ExportsMap): ExportsDiff {
  const cur = (current && typeof current === 'object' ? current : {}) as Record<string, unknown>
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
