import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { entryRecordToExports } from './syncExports.js';

let root: string | undefined;

afterEach(() => {
  if (root) {
    rmSync(root, { recursive: true, force: true });
  }

  root = undefined;
});

describe('generated exports integration', () => {
  it('points to files emitted by an ES-only Vite and TypeScript build', async () => {
    root = mkdtempSync(join(tmpdir(), 'vite-exports-integration-'));
    const sourceRoot = join(root, 'src');
    const source = join(sourceRoot, 'Users/index.ts');

    mkdirSync(join(sourceRoot, 'Users'), { recursive: true });
    writeFileSync(source, 'export type User = { id: string }\nexport const user = { id: "1" }\n');

    await build({
      configFile: false,
      logLevel: 'silent',
      build: {
        outDir: join(root, 'dist'),
        lib: {
          entry: { Users: source },
          formats: ['es'],
          fileName: (_, entryName) => `${entryName}.js`,
        },
      },
    });

    execFileSync(
      process.execPath,
      [
        resolve(import.meta.dirname, '../node_modules/typescript/bin/tsc'),
        '--declaration',
        '--emitDeclarationOnly',
        '--rootDir',
        'src',
        '--outDir',
        'dist',
        'src/Users/index.ts',
      ],
      { cwd: root },
    );

    const generated = entryRecordToExports({ Users: source }, { sourceRoot, formats: ['es'] })[
      './Users'
    ];

    expect(generated.require).toBeUndefined();
    expect(generated.import && existsSync(resolve(root, generated.import))).toBe(true);
    expect(generated.types && existsSync(resolve(root, generated.types))).toBe(true);
  });
});
