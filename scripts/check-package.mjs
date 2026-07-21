import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const projectRoot = resolve(import.meta.dirname, '..')
const temporaryRoot = mkdtempSync(join(tmpdir(), 'vite-magic-package-'))
const cache = join(temporaryRoot, 'npm-cache')
const consumer = join(temporaryRoot, 'consumer')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf-8',
    shell: process.platform === 'win32',
    ...options,
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} exited with ${result.status}`)
  }
  return result.stdout.trim()
}

try {
  const packOutput = run(npmCommand, [
    'pack',
    '--json',
    '--ignore-scripts',
    '--cache',
    cache,
    '--pack-destination',
    temporaryRoot,
  ])
  const [{ filename, files }] = JSON.parse(packOutput)
  const tarball = join(temporaryRoot, filename)

  if (!files.some(({ path }) => path === 'dist/cli.js')) {
    throw new Error('Packed package is missing dist/cli.js')
  }

  run(npmCommand, [
    'install',
    '--prefix',
    consumer,
    '--ignore-scripts',
    '--no-package-lock',
    '--legacy-peer-deps',
    '--cache',
    cache,
    tarball,
  ])

  const bin = join(
    consumer,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'vite-magic.cmd' : 'vite-magic'
  )
  const installedVersion = run(bin, ['--version'])
  const expectedVersion = String(
    JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8')).version
  )

  if (installedVersion !== expectedVersion) {
    throw new Error(`Installed CLI returned ${installedVersion}; expected ${expectedVersion}`)
  }

  console.log(`Packed CLI OK (${installedVersion})`)
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
