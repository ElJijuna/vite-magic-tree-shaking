import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCli } from './cli.js';

let root: string | undefined;

afterEach(() => {
  vi.restoreAllMocks();

  if (root) {
    rmSync(root, { recursive: true, force: true });
  }

  root = undefined;
});

function fixture(exports: Record<string, unknown> = {}): string {
  root = mkdtempSync(join(tmpdir(), 'vite-cli-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/index.ts'), '');
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify({ name: 'fixture', exports }, null, 2)}\n`,
  );

  return root;
}

describe('runCli', () => {
  it('returns success for help', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(runCli(['--help'])).toBe(0);
  });

  it('reports errors without a stack trace', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(runCli(['validate', '/definitely/missing/project'])).toBe(1);
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0][0]).toContain('Source directory does not exist');
  });

  it('preserves custom exports when generating', () => {
    const project = fixture({ './custom': './custom.js' });

    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(runCli(['generate', project, 'src', '--formats', 'es'])).toBe(0);
    const packageJson = JSON.parse(readFileSync(join(project, 'package.json'), 'utf-8')) as {
      exports: unknown;
    };

    expect(packageJson.exports).toEqual({
      './custom': './custom.js',
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
      },
    });
  });

  it('does not write during a dry run', () => {
    const project = fixture();
    const packagePath = join(project, 'package.json');
    const before = readFileSync(packagePath, 'utf-8');

    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(runCli(['generate', project, 'src', '--dry-run'])).toBe(0);
    expect(readFileSync(packagePath, 'utf-8')).toBe(before);
  });

  it('only rejects additional exports in strict validation mode', () => {
    const project = fixture({
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
        require: './dist/index.cjs',
      },
      './custom': './custom.js',
    });

    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(runCli(['validate', project])).toBe(0);
    expect(runCli(['validate', project, 'src', '--strict'])).toBe(1);
  });
});
