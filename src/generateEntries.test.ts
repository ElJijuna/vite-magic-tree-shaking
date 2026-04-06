import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { generateEntries } from './generateEntries.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function touch(filePath: string): void {
  mkdirSync(join(filePath, '..'), { recursive: true })
  writeFileSync(filePath, '')
}

function makeFixture(files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'vite-entries-'))
  for (const f of files) touch(join(root, f))
  return root
}

// Normalise absolute paths → relative to root so snapshots are stable
function relativise(entries: Record<string, string>, root: string) {
  return Object.fromEntries(
    Object.entries(entries).map(([k, v]) => [k, v.replace(root + '/', '')])
  )
}

// ---------------------------------------------------------------------------

let root: string

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Root-level files
// ---------------------------------------------------------------------------

describe('root src/index', () => {
  it('picks up src/index.ts', () => {
    root = makeFixture(['src/index.ts'])
    expect(relativise(generateEntries(root), root)).toEqual({
      index: 'src/index.ts',
    })
  })

  it('picks up src/index.tsx', () => {
    root = makeFixture(['src/index.tsx'])
    expect(relativise(generateEntries(root), root)).toEqual({
      index: 'src/index.tsx',
    })
  })

  it('uses custom srcDir', () => {
    root = makeFixture(['lib/index.ts'])
    expect(relativise(generateEntries(root, 'lib'), root)).toEqual({
      index: 'lib/index.ts',
    })
  })
})

// ---------------------------------------------------------------------------
// Directory with index
// ---------------------------------------------------------------------------

describe('directory with index', () => {
  beforeEach(() => {
    root = makeFixture(['src/Users/index.ts'])
  })

  it('uses the directory name as key', () => {
    expect(relativise(generateEntries(root), root)).toEqual({
      Users: 'src/Users/index.ts',
    })
  })

  it('still scans subdirectories inside an indexed dir', () => {
    touch(join(root, 'src/Users/domain/user.ts'))
    touch(join(root, 'src/Users/types/UserDTO.ts'))

    expect(relativise(generateEntries(root), root)).toEqual({
      Users: 'src/Users/index.ts',
      'Users/domain/user': 'src/Users/domain/user.ts',
      'Users/types/UserDTO': 'src/Users/types/UserDTO.ts',
    })
  })
})

// ---------------------------------------------------------------------------
// Directory without index
// ---------------------------------------------------------------------------

describe('directory without index', () => {
  it('uses dir/file as key for a named file', () => {
    root = makeFixture(['src/Users/Users.tsx'])
    expect(relativise(generateEntries(root), root)).toEqual({
      'Users/Users': 'src/Users/Users.tsx',
    })
  })

  it('registers every valid file when there is no index', () => {
    root = makeFixture([
      'src/utils/utils.ts',
      'src/utils/helper.ts',
    ])
    expect(relativise(generateEntries(root), root)).toEqual({
      'utils/utils': 'src/utils/utils.ts',
      'utils/helper': 'src/utils/helper.ts',
    })
  })
})

// ---------------------------------------------------------------------------
// Ignored files
// ---------------------------------------------------------------------------

describe('ignored files', () => {
  it('excludes .test.ts files', () => {
    root = makeFixture(['src/utils/utils.ts', 'src/utils/utils.test.ts'])
    expect(relativise(generateEntries(root), root)).toEqual({
      'utils/utils': 'src/utils/utils.ts',
    })
  })

  it('excludes .spec.ts files', () => {
    root = makeFixture(['src/utils/utils.ts', 'src/utils/utils.spec.ts'])
    expect(relativise(generateEntries(root), root)).toEqual({
      'utils/utils': 'src/utils/utils.ts',
    })
  })

  it('excludes .stories.tsx files', () => {
    root = makeFixture(['src/Button/Button.tsx', 'src/Button/Button.stories.tsx'])
    expect(relativise(generateEntries(root), root)).toEqual({
      'Button/Button': 'src/Button/Button.tsx',
    })
  })

  it('excludes .d.ts declaration files', () => {
    // index.ts is present → dir key "types", and global.d.ts is ignored
    root = makeFixture(['src/types/index.ts', 'src/types/global.d.ts'])
    expect(relativise(generateEntries(root), root)).toEqual({
      types: 'src/types/index.ts',
    })
  })

  it('excludes .d.ts when there is no index (standalone file)', () => {
    root = makeFixture(['src/types/UserDTO.ts', 'src/types/global.d.ts'])
    expect(relativise(generateEntries(root), root)).toEqual({
      'types/UserDTO': 'src/types/UserDTO.ts',
    })
  })

  it('excludes non-JS/TS files', () => {
    root = makeFixture(['src/Users/index.ts', 'src/Users/styles.css', 'src/Users/README.md'])
    expect(relativise(generateEntries(root), root)).toEqual({
      Users: 'src/Users/index.ts',
    })
  })
})

// ---------------------------------------------------------------------------
// Mixed / realistic tree
// ---------------------------------------------------------------------------

describe('realistic project tree', () => {
  it('handles a full mixed structure', () => {
    root = makeFixture([
      'src/index.ts',
      'src/Users/index.ts',
      'src/Users/domain/user.ts',
      'src/Users/types/UserDTO.ts',
      'src/Users/Users.test.ts',   // ignored
      'src/Button/Button.tsx',     // no index
      'src/Button/Button.test.tsx', // ignored
      'src/utils/utils.ts',
      'src/utils/helpers.ts',
    ])

    expect(relativise(generateEntries(root), root)).toEqual({
      index: 'src/index.ts',
      Users: 'src/Users/index.ts',
      'Users/domain/user': 'src/Users/domain/user.ts',
      'Users/types/UserDTO': 'src/Users/types/UserDTO.ts',
      'Button/Button': 'src/Button/Button.tsx',
      'utils/utils': 'src/utils/utils.ts',
      'utils/helpers': 'src/utils/helpers.ts',
    })
  })
})
