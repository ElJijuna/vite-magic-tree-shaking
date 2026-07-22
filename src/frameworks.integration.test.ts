import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue';
import { renderToString } from '@vue/server-renderer';
import { type ComponentType, createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build, type PluginOption } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { createSSRApp, h, type Component as VueComponent } from 'vue';
import { generateEntries } from './generateEntries.js';
import { viteMagic } from './plugin.js';
import { entryRecordToExports } from './syncExports.js';

const fixtureRoot = resolve(import.meta.dirname, '../test/fixtures');
const temporaryRoots: string[] = [];

type FrameworkFixture = {
  name: string;
  plugin: () => PluginOption;
  external: (string | RegExp)[];
  verify: (component: unknown) => Promise<void> | void;
};

const frameworks: FrameworkFixture[] = [
  {
    name: 'React',
    plugin: react,
    external: ['react', 'react-dom', /^react\//],
    verify(component) {
      const Button = component as ComponentType<{ children?: ReactNode }>;

      expect(renderToStaticMarkup(createElement(Button, null, 'React'))).toContain('React');
    },
  },
  {
    name: 'Vue',
    plugin: vue,
    external: ['vue'],
    async verify(component) {
      const app = createSSRApp({
        render: () => h(component as VueComponent, { label: 'Vue' }),
      });

      expect(await renderToString(app)).toContain('Vue');
    },
  },
  {
    name: 'Svelte',
    plugin: svelte,
    external: ['svelte', /^svelte\//],
    verify(component) {
      expect(component).toBeTypeOf('function');
    },
  },
];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function copyFixture(name: string): string {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'vite-magic-framework-'));
  const project = join(temporaryRoot, name.toLowerCase());

  temporaryRoots.push(temporaryRoot);
  cpSync(join(fixtureRoot, name.toLowerCase()), project, { recursive: true });

  return project;
}

describe('framework library integration', () => {
  it.each(frameworks)('builds and imports a $name component library', async (framework) => {
    const project = copyFixture(framework.name);
    const sourceRoot = join(project, 'src');
    const exportsOptions = {
      sourceRoot,
      formats: ['es'] as const,
      includeTypes: false,
    };

    await build({
      root: project,
      configFile: false,
      logLevel: 'silent',
      plugins: [framework.plugin(), viteMagic({ configFile: false, exports: exportsOptions })],
      build: {
        rollupOptions: {
          external: framework.external,
        },
      },
    });

    const entries = generateEntries(project);
    const exportMap = entryRecordToExports(entries, exportsOptions);

    for (const conditions of Object.values(exportMap)) {
      expect(conditions.import && existsSync(resolve(project, conditions.import))).toBe(true);
    }

    const mainImport = exportMap['.'].import;

    if (!mainImport) {
      throw new Error('Expected an ES module package export');
    }

    const library = (await import(pathToFileURL(resolve(project, mainImport)).href)) as Record<
      string,
      unknown
    >;

    expect(library).toHaveProperty('Button');
    await framework.verify(library.Button);
  });
});
