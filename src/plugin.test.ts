import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build, type ResolvedConfig, resolveConfig as resolveViteConfig } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { viteMagic } from './plugin.js';
import { entryRecordToExports } from './syncExports.js';

let root: string | undefined;

afterEach(() => {
  if (root) {
    rmSync(root, { recursive: true, force: true });
  }

  root = undefined;
});

function fixture(): string {
  root = mkdtempSync(join(tmpdir(), 'vite-magic-plugin-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/index.ts'), 'export const value = 1\n');
  writeFileSync(join(root, 'package.json'), '{"name":"fixture"}\n');

  return root;
}

async function resolved(project: string, options = viteMagic({ configFile: false })) {
  return resolveViteConfig(
    {
      root: project,
      configFile: false,
      logLevel: 'silent',
      plugins: [options],
    },
    'build',
  );
}

function libraryEntry(config: ResolvedConfig): Record<string, string> {
  const library = config.build.lib;

  if (!library || typeof library.entry !== 'object' || Array.isArray(library.entry)) {
    throw new Error('Expected a generated library entry record');
  }

  return library.entry;
}

describe('viteMagic', () => {
  it('builds a library without a manual build.lib.entry', async () => {
    const project = fixture();

    await build({
      root: project,
      configFile: false,
      logLevel: 'silent',
      plugins: [
        viteMagic({
          configFile: false,
          exports: {
            formats: ['es'],
            outDir: 'build',
            includeTypes: false,
            importExtension: '.mjs',
          },
        }),
      ],
    });

    const exportMap = entryRecordToExports(
      { index: join(project, 'src/index.ts') },
      {
        sourceRoot: join(project, 'src'),
        formats: ['es'],
        outDir: 'build',
        includeTypes: false,
        importExtension: '.mjs',
      },
    );
    const importTarget = exportMap['.'].import;

    expect(importTarget && existsSync(resolve(project, importTarget))).toBe(true);
  });

  it('generates build.lib.entry and preserves other library options', async () => {
    const project = fixture();
    const config = await resolved(
      project,
      viteMagic({
        configFile: false,
        exports: { formats: ['es'] },
        library: { name: 'Fixture' },
      }),
    );

    expect(libraryEntry(config)).toEqual({ index: join(project, 'src/index.ts') });

    if (!config.build.lib) {
      throw new Error('Expected library options');
    }

    expect(config.build.lib.formats).toEqual(['es']);
    expect(config.build.lib.name).toBe('Fixture');
  });

  it('discovers vite-magic.config.ts from the Vite root', async () => {
    const project = fixture();

    mkdirSync(join(project, 'lib'), { recursive: true });
    writeFileSync(join(project, 'lib/index.ts'), '');
    writeFileSync(
      join(project, 'vite-magic.config.ts'),
      "export default { srcDir: 'lib', exports: { formats: ['es'], outDir: 'build', importExtension: '.mjs' } }\n",
    );

    const config = await resolved(project, viteMagic());

    expect(libraryEntry(config)).toEqual({ index: join(project, 'lib/index.ts') });

    if (!config.build.lib) {
      throw new Error('Expected library options');
    }

    expect(config.build.lib.formats).toEqual(['es']);
    expect(config.build.outDir).toBe(join(project, 'build'));
    expect(config.build.lib.fileName).toBeTypeOf('function');
    expect(
      typeof config.build.lib.fileName === 'function' && config.build.lib.fileName('es', 'index'),
    ).toBe('index.mjs');

    const { output } = config.build.rollupOptions;

    if (!output || Array.isArray(output)) {
      throw new Error('Expected one Rollup output configuration');
    }

    expect(output.preserveModules).toBe(true);
    expect(output.preserveModulesRoot).toBe(join(project, 'lib'));
  });

  it('lets inline options override the shared config', async () => {
    const project = fixture();

    mkdirSync(join(project, 'lib'), { recursive: true });
    writeFileSync(join(project, 'lib/index.ts'), '');
    writeFileSync(join(project, 'vite-magic.config.ts'), "export default { srcDir: 'lib' }\n");

    const config = await resolved(project, viteMagic({ srcDir: 'src' }));

    expect(libraryEntry(config)).toEqual({ index: join(project, 'src/index.ts') });
  });

  it('rejects a manually configured library entry', async () => {
    const project = fixture();

    await expect(
      resolveViteConfig(
        {
          root: project,
          configFile: false,
          logLevel: 'silent',
          plugins: [viteMagic({ configFile: false })],
          build: { lib: { entry: join(project, 'src/index.ts') } },
        },
        'build',
      ),
    ).rejects.toThrow('Remove build.lib.entry');
  });

  it('rejects a duplicate Vite output directory', async () => {
    const project = fixture();

    await expect(
      resolveViteConfig(
        {
          root: project,
          configFile: false,
          logLevel: 'silent',
          plugins: [viteMagic({ configFile: false })],
          build: { outDir: 'duplicate' },
        },
        'build',
      ),
    ).rejects.toThrow('configure exports.outDir instead');
  });
});
