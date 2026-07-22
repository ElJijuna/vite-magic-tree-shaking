import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  diffExports,
  entryRecordToExports,
  exportsAreSynced,
  mergeExports,
  readPackageJson,
  resolveExportsOptions,
  writePackageJson,
} from './syncExports.js';

let root: string | undefined;

afterEach(() => {
  if (root) {
    rmSync(root, { recursive: true, force: true });
  }

  root = undefined;
});

function fixture(): string {
  root = mkdtempSync(join(tmpdir(), 'vite-exports-'));
  mkdirSync(join(root, 'src/Users'), { recursive: true });

  return root;
}

describe('entryRecordToExports', () => {
  it('resolves one canonical output contract', () => {
    expect(resolveExportsOptions({ outDir: './build', formats: ['es', 'es'] })).toEqual({
      sourceRoot: undefined,
      outDir: 'build',
      typesOutDir: 'build',
      formats: ['es'],
      includeTypes: true,
      importExtension: '.js',
      requireExtension: '.cjs',
      conditions: {},
    });
  });

  it('only emits conditions for configured formats', () => {
    const project = fixture();
    const source = join(project, 'src/index.ts');

    expect(
      entryRecordToExports(
        { index: source },
        { sourceRoot: join(project, 'src'), formats: ['es'] },
      ),
    ).toEqual({
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
      },
    });
  });

  it('maps nested index declarations to their real TypeScript output path', () => {
    const project = fixture();
    const source = join(project, 'src/Users/index.ts');

    expect(
      entryRecordToExports(
        { Users: source },
        { sourceRoot: join(project, 'src'), formats: ['es'] },
      ),
    ).toEqual({
      './Users': {
        types: './dist/Users/index.d.ts',
        import: './dist/Users.js',
      },
    });
  });

  it('uses declaration extensions for mts and cts sources', () => {
    const project = fixture();
    const sourceRoot = join(project, 'src');

    expect(
      entryRecordToExports(
        {
          module: join(sourceRoot, 'module.mts'),
          common: join(sourceRoot, 'common.cts'),
        },
        { sourceRoot, formats: [] },
      ),
    ).toEqual({
      './common': { types: './dist/common.d.cts' },
      './module': { types: './dist/module.d.mts' },
    });
  });

  it('supports custom output directories and extensions', () => {
    expect(
      entryRecordToExports(
        { index: 'src/index.ts' },
        {
          outDir: 'build/js',
          typesOutDir: 'build/types',
          importExtension: '.mjs',
          requireExtension: '.js',
        },
      ),
    ).toEqual({
      '.': {
        types: './build/types/index.d.ts',
        import: './build/js/index.mjs',
        require: './build/js/index.js',
      },
    });
  });

  it('supports custom, nested, and templated export conditions', () => {
    expect(
      entryRecordToExports(
        { index: 'src/index.ts' },
        {
          conditions: {
            browser: 'import',
            node: { import: 'import', require: 'require' },
            development: './development/[name].js',
            default: 'import',
          },
        },
      ),
    ).toEqual({
      '.': {
        types: './dist/index.d.ts',
        browser: './dist/index.js',
        node: {
          import: './dist/index.js',
          require: './dist/index.cjs',
        },
        development: './development/index.js',
        import: './dist/index.js',
        require: './dist/index.cjs',
        default: './dist/index.js',
      },
    });
    expect(
      Object.keys(
        entryRecordToExports(
          { index: 'src/index.ts' },
          { conditions: { default: 'import', browser: 'import' } },
        )['.'],
      ),
    ).toEqual(['types', 'browser', 'import', 'require', 'default']);
  });

  it('rejects unsafe or unavailable custom conditions', () => {
    expect(() =>
      entryRecordToExports(
        { index: 'src/index.ts' },
        { formats: ['es'], conditions: { node: 'require' } },
      ),
    ).toThrow('references disabled target: require');
    expect(() =>
      entryRecordToExports(
        { index: 'src/index.ts' },
        { conditions: { development: './../outside/[name].js' } },
      ),
    ).toThrow('must stay inside the package');
    expect(() =>
      entryRecordToExports({ index: 'src/index.ts' }, { conditions: { default: '' as './' } }),
    ).toThrow('must stay inside the package');
  });

  it('rejects output paths outside the package', () => {
    expect(() => entryRecordToExports({ index: 'src/index.ts' }, { outDir: '../outside' })).toThrow(
      'outDir must be a non-empty path inside the package',
    );
  });

  it('rejects unsafe entry keys and extensions', () => {
    expect(() => entryRecordToExports({ '../escape': 'src/escape.ts' })).toThrow(
      'Invalid entry key',
    );
    expect(() =>
      entryRecordToExports({ index: 'src/index.ts' }, { importExtension: '/../../outside.js' }),
    ).toThrow('importExtension must be a file extension');
  });
});

describe('export comparison and merging', () => {
  const expected = {
    '.': { types: './dist/index.d.ts', import: './dist/index.js' },
  };

  it('does not depend on top-level key order', () => {
    const multiple = {
      './feature': { import: './dist/feature.js' },
      ...expected,
    };
    const reordered = {
      ...expected,
      './feature': { import: './dist/feature.js' },
    };

    expect(exportsAreSynced(multiple, reordered)).toBe(true);
  });

  it('can allow custom export keys', () => {
    const current = { ...expected, './package.json': './package.json' };

    expect(exportsAreSynced(current, expected)).toBe(false);
    expect(exportsAreSynced(current, expected, { allowExtra: true })).toBe(true);
  });

  it('preserves custom exports by default and prunes only explicitly', () => {
    const current = { './custom': './custom.js' };

    expect(mergeExports(current, expected)).toEqual({
      './custom': './custom.js',
      ...expected,
    });
    expect(mergeExports(current, expected, { prune: true })).toEqual(expected);
  });

  it('reports missing, changed, and extra keys', () => {
    expect(
      diffExports(
        {
          '.': { import: './wrong.js' },
          './custom': './custom.js',
        },
        {
          ...expected,
          './missing': { import: './dist/missing.js' },
        },
      ),
    ).toEqual({
      missing: ['./missing'],
      extra: ['./custom'],
      changed: ['.'],
    });
  });
});

describe('package.json I/O', () => {
  it('writes atomically while preserving indentation and final newline', () => {
    const project = fixture();
    const packagePath = join(project, 'package.json');

    writeFileSync(packagePath, '{\n\t"name": "fixture"\n}\n');

    const pkg = readPackageJson(project);

    pkg.exports = { '.': './dist/index.js' };
    writePackageJson(project, pkg);

    expect(readFileSync(packagePath, 'utf-8')).toBe(
      '{\n\t"name": "fixture",\n\t"exports": {\n\t\t".": "./dist/index.js"\n\t}\n}\n',
    );
  });

  it('rejects non-object package.json content', () => {
    const project = fixture();

    writeFileSync(join(project, 'package.json'), '[]\n');

    expect(() => readPackageJson(project)).toThrow('package.json must contain a JSON object');
  });
});
