import { dirname, resolve } from 'node:path';
import type { LibraryOptions, Plugin, UserConfig } from 'vite';
import { loadConfig, resolveConfig, type ViteMagicConfig } from './config.js';
import { generateEntries } from './generateEntries.js';
import { resolveExportsOptions } from './syncExports.js';

export interface ViteMagicPluginOptions extends ViteMagicConfig {
  /** Custom config path, relative to the Vite root. Set to `false` to disable discovery. */
  configFile?: string | false;

  /** Additional Vite library options. Entry, formats, and file names come from shared config. */
  library?: Omit<LibraryOptions, 'entry' | 'formats' | 'fileName'>;
}

async function pluginConfig(
  viteRoot: string,
  inlineConfig: ViteMagicConfig,
  configFile: string | false | undefined,
): Promise<ReturnType<typeof resolveConfig>> {
  const {
    rootDir: inlineRootDir,
    srcDir: inlineSrcDir,
    exports: inlineExports,
    ...inlineOptions
  } = inlineConfig;
  const loaded = configFile === false ? null : await loadConfig(viteRoot, configFile);
  const configDir = loaded ? dirname(loaded.path) : viteRoot;
  const fromFile = resolveConfig(loaded?.config ?? {}, configDir);

  return {
    rootDir: inlineRootDir === undefined ? fromFile.rootDir : resolve(viteRoot, inlineRootDir),
    srcDir: inlineSrcDir ?? fromFile.srcDir,
    options: {
      ...fromFile.options,
      ...inlineOptions,
      exports: {
        ...fromFile.options.exports,
        ...inlineExports,
      },
    },
  };
}

/** Configures `build.lib.entry` from source files discovered by vite-magic. */
export function viteMagic(options: ViteMagicPluginOptions = {}): Plugin {
  const { configFile, library: libraryOptions, ...inlineConfig } = options;

  return {
    name: 'vite-magic-tree-shaking',
    enforce: 'pre',
    async config(config): Promise<UserConfig> {
      const library = config.build?.lib;

      if (library === false) {
        throw new Error(
          '[vite-magic-tree-shaking] build.lib cannot be false when using viteMagic()',
        );
      }

      if (library?.entry !== undefined) {
        throw new Error(
          '[vite-magic-tree-shaking] Remove build.lib.entry when using viteMagic(); entries are generated automatically',
        );
      }

      if (config.build?.outDir !== undefined) {
        throw new Error(
          '[vite-magic-tree-shaking] Remove build.outDir when using viteMagic(); configure exports.outDir instead',
        );
      }

      const rollupOutput = config.build?.rollupOptions?.output;

      if (Array.isArray(rollupOutput)) {
        throw new Error(
          '[vite-magic-tree-shaking] rollupOptions.output arrays are not supported by viteMagic()',
        );
      }

      if (rollupOutput?.preserveModulesRoot !== undefined) {
        throw new Error(
          '[vite-magic-tree-shaking] Remove preserveModulesRoot when using viteMagic(); it is derived from srcDir',
        );
      }

      const viteRoot = resolve(process.cwd(), config.root ?? '.');
      const magicConfig = await pluginConfig(viteRoot, inlineConfig, configFile);
      const entry = generateEntries(magicConfig.rootDir, magicConfig.srcDir, magicConfig.options);
      const output = resolveExportsOptions(magicConfig.options.exports);
      const existingLibrary = library && typeof library === 'object' ? library : {};
      const preserveModulesRoot = resolve(magicConfig.rootDir, magicConfig.srcDir);

      return {
        build: {
          outDir: resolve(magicConfig.rootDir, output.outDir),
          lib: {
            ...existingLibrary,
            ...libraryOptions,
            formats: [...output.formats],
            fileName: (format, entryName) => {
              if (format === 'es') {
                return `${entryName}${output.importExtension}`;
              }

              if (format === 'cjs') {
                return `${entryName}${output.requireExtension}`;
              }

              throw new Error(`[vite-magic-tree-shaking] Unsupported library format: ${format}`);
            },
            entry,
          },
          rollupOptions: {
            output: {
              preserveModules: true,
              preserveModulesRoot,
            },
          },
        },
      };
    },
  };
}
