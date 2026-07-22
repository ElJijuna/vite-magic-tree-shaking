import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defineConfig, generateEntriesFromConfig, loadConfig, resolveConfig } from './config.js';

let root: string | undefined;

afterEach(() => {
  if (root) {
    rmSync(root, { recursive: true, force: true });
  }

  root = undefined;
});

function fixture(): string {
  root = mkdtempSync(join(tmpdir(), 'vite-magic-config-'));

  return root;
}

describe('magic config', () => {
  it('provides defaults relative to the config directory', () => {
    const project = fixture();

    expect(resolveConfig({}, project)).toEqual({
      rootDir: project,
      srcDir: 'src',
      options: {},
    });
  });

  it('keeps defineConfig transparent', () => {
    const config = { srcDir: 'lib', exports: { formats: ['es'] as const } };

    expect(defineConfig(config)).toBe(config);
  });

  it('generates entries using shared config options', () => {
    const project = fixture();

    mkdirSync(join(project, 'packages/library'), { recursive: true });
    writeFileSync(join(project, 'packages/library/index.ts'), '');
    writeFileSync(join(project, 'packages/library/private.ts'), '');

    expect(
      generateEntriesFromConfig(
        {
          rootDir: 'packages',
          srcDir: 'library',
          exclude: (path) => path === 'private.ts',
        },
        project,
      ),
    ).toEqual({ index: join(project, 'packages/library/index.ts') });
  });

  it('loads vite-magic.config.ts automatically', async () => {
    const project = fixture();

    writeFileSync(
      join(project, 'vite-magic.config.ts'),
      "export default { srcDir: 'lib', exports: { formats: ['es'] } }\n",
    );

    const loaded = await loadConfig(project);

    expect(loaded?.path).toBe(join(project, 'vite-magic.config.ts'));
    expect(loaded?.config).toEqual({ srcDir: 'lib', exports: { formats: ['es'] } });
  });

  it('returns null when the default config does not exist', async () => {
    const project = fixture();

    await expect(loadConfig(project)).resolves.toBeNull();
  });

  it('rejects a missing explicit config file', async () => {
    const project = fixture();

    await expect(loadConfig(project, 'custom.config.ts')).rejects.toThrow(
      'Config file does not exist',
    );
  });
});
