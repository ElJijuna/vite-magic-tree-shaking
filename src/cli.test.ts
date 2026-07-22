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
  it('returns success for help', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(runCli(['--help'])).resolves.toBe(0);
  });

  it('reports errors without a stack trace', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runCli(['validate', '/definitely/missing/project'])).resolves.toBe(1);
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0][0]).toContain('Source directory does not exist');
  });

  it('preserves custom exports when generating', async () => {
    const project = fixture({ './custom': './custom.js' });

    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(runCli(['generate', project, 'src', '--formats', 'es'])).resolves.toBe(0);
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

  it('does not write during a dry run', async () => {
    const project = fixture();
    const packagePath = join(project, 'package.json');
    const before = readFileSync(packagePath, 'utf-8');

    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(runCli(['generate', project, 'src', '--dry-run'])).resolves.toBe(0);
    expect(readFileSync(packagePath, 'utf-8')).toBe(before);
  });

  it('only rejects additional exports in strict validation mode', async () => {
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

    await expect(runCli(['validate', project])).resolves.toBe(0);
    await expect(runCli(['validate', project, 'src', '--strict'])).resolves.toBe(1);
  });

  it('uses vite-magic.config.ts automatically', async () => {
    const project = fixture();

    mkdirSync(join(project, 'lib'), { recursive: true });
    writeFileSync(join(project, 'lib/index.ts'), '');
    writeFileSync(
      join(project, 'vite-magic.config.ts'),
      `export default {
  srcDir: 'lib',
  exports: { formats: ['es'], outDir: 'build', includeTypes: false },
}\n`,
    );

    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(runCli(['generate', project])).resolves.toBe(0);

    const packageJson = JSON.parse(readFileSync(join(project, 'package.json'), 'utf-8')) as {
      exports: unknown;
    };

    expect(packageJson.exports).toEqual({ '.': { import: './build/index.js' } });
  });

  it('lets CLI options override the config file', async () => {
    const project = fixture();

    writeFileSync(
      join(project, 'vite-magic.config.ts'),
      "export default { exports: { formats: ['es'], outDir: 'build' } }\n",
    );

    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(
      runCli(['generate', project, '--formats', 'cjs', '--out-dir', 'dist', '--no-types']),
    ).resolves.toBe(0);

    const packageJson = JSON.parse(readFileSync(join(project, 'package.json'), 'utf-8')) as {
      exports: unknown;
    };

    expect(packageJson.exports).toEqual({ '.': { require: './dist/index.cjs' } });
  });

  it('loads an explicit config path relative to the project root', async () => {
    const project = fixture();

    mkdirSync(join(project, 'config'), { recursive: true });
    mkdirSync(join(project, 'lib'), { recursive: true });
    writeFileSync(join(project, 'lib/index.ts'), '');
    writeFileSync(
      join(project, 'config/magic.ts'),
      "export default { rootDir: '..', srcDir: 'lib', exports: { formats: ['es'] } }\n",
    );

    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(runCli(['generate', '--config', 'config/magic.ts', project])).resolves.toBe(0);
  });

  it('generates every workspace with shared and package-local config', async () => {
    root = mkdtempSync(join(tmpdir(), 'vite-cli-monorepo-'));
    const packages = ['alpha', 'beta'];

    writeFileSync(
      join(root, 'package.json'),
      `${JSON.stringify({ private: true, workspaces: ['packages/*'] })}\n`,
    );
    writeFileSync(
      join(root, 'vite-magic.config.ts'),
      `export default {
  srcDir: 'source',
  exports: {
    formats: ['es'],
    includeTypes: false,
    conditions: { browser: 'import' },
  },
}\n`,
    );

    for (const name of packages) {
      const workspace = join(root, 'packages', name);

      mkdirSync(join(workspace, 'source'), { recursive: true });
      writeFileSync(join(workspace, 'source/index.ts'), '');
      writeFileSync(
        join(workspace, 'package.json'),
        `${JSON.stringify({ name: `@fixture/${name}` })}\n`,
      );
    }

    writeFileSync(
      join(root, 'packages/beta/vite-magic.config.ts'),
      "export default { exports: { outDir: 'build' } }\n",
    );

    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(runCli(['generate', root])).resolves.toBe(0);
    await expect(runCli(['validate', root])).resolves.toBe(0);

    const alpha = JSON.parse(readFileSync(join(root, 'packages/alpha/package.json'), 'utf-8')) as {
      exports: unknown;
    };
    const beta = JSON.parse(readFileSync(join(root, 'packages/beta/package.json'), 'utf-8')) as {
      exports: unknown;
    };

    expect(alpha.exports).toEqual({
      '.': { browser: './dist/index.js', import: './dist/index.js' },
    });
    expect(beta.exports).toEqual({
      '.': { browser: './build/index.js', import: './build/index.js' },
    });
  });
});
