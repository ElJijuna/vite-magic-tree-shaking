import { resolve } from 'node:path'
import { generateEntries } from './generateEntries.js'
import {
  entryRecordToExports,
  readPackageJson,
  writePackageJson,
  exportsAreSynced,
  diffExports,
} from './syncExports.js'

const [, , command, rootDirArg, srcDirArg] = process.argv
const rootDir = rootDirArg ? resolve(rootDirArg) : process.cwd()
const srcDir = srcDirArg ?? 'src'

function printUsage(): void {
  console.log('Usage: vite-magic <command> [rootDir] [srcDir]')
  console.log('')
  console.log('Commands:')
  console.log('  generate  Write exports to package.json based on src entries')
  console.log('  validate  Check that package.json exports match src entries')
  console.log('')
  console.log('Arguments:')
  console.log('  rootDir   Project root (default: cwd)')
  console.log('  srcDir    Source directory relative to rootDir (default: src)')
}

if (command === 'generate') {
  const entries = generateEntries(rootDir, srcDir)
  const expected = entryRecordToExports(entries)
  const pkg = readPackageJson(rootDir)

  if (exportsAreSynced(pkg.exports, expected)) {
    console.log('✓ package.json exports are already in sync')
    process.exit(0)
  }

  pkg.exports = expected
  writePackageJson(rootDir, pkg)
  console.log('✓ package.json exports updated:')
  for (const key of Object.keys(expected)) {
    console.log(`  ${key}`)
  }
} else if (command === 'validate') {
  const entries = generateEntries(rootDir, srcDir)
  const expected = entryRecordToExports(entries)
  const pkg = readPackageJson(rootDir)

  if (exportsAreSynced(pkg.exports, expected)) {
    console.log('✓ package.json exports are in sync')
    process.exit(0)
  }

  const { missing, extra, changed } = diffExports(pkg.exports, expected)
  console.error('✗ package.json exports are out of sync with src entries')
  if (missing.length) console.error(`  Missing : ${missing.join(', ')}`)
  if (extra.length) console.error(`  Extra   : ${extra.join(', ')}`)
  if (changed.length) console.error(`  Changed : ${changed.join(', ')}`)
  console.error('')
  console.error('Run: npx vite-magic generate')
  process.exit(1)
} else {
  printUsage()
  process.exit(command ? 1 : 0)
}
