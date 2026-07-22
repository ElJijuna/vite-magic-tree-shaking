import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { GenerateEntriesOptions } from './generateEntries.js';
import { type EntryRecord, generateEntries } from './generateEntries.js';

export const DEFAULT_CONFIG_FILE = 'vite-magic.config.ts';

export interface ViteMagicConfig extends GenerateEntriesOptions {
  /** Project root, relative to the config file. @default '.' */
  rootDir?: string;

  /** Source directory, relative to `rootDir`. @default 'src' */
  srcDir?: string;
}

export interface LoadedViteMagicConfig {
  config: ViteMagicConfig;
  path: string;
}

export interface ResolvedViteMagicConfig {
  rootDir: string;
  srcDir: string;
  options: GenerateEntriesOptions;
}

export interface LoadConfigOptions {
  /** Search parent directories when the default config is not present locally. */
  searchParents?: boolean;
}

/** Provides type checking and autocomplete for `vite-magic.config.ts`. */
export function defineConfig(config: ViteMagicConfig): ViteMagicConfig {
  return config;
}

/** Merges shared and package-local config while preserving nested export options. */
export function mergeConfig(base: ViteMagicConfig, override: ViteMagicConfig): ViteMagicConfig {
  const merged = { ...base, ...override };

  if (base.exports || override.exports) {
    merged.exports = { ...base.exports, ...override.exports };
  }

  return merged;
}

/** Resolves config paths relative to the directory containing the config file. */
export function resolveConfig(
  config: ViteMagicConfig,
  configDir: string = process.cwd(),
): ResolvedViteMagicConfig {
  const { rootDir = '.', srcDir = 'src', ...options } = config;

  return {
    rootDir: resolve(configDir, rootDir),
    srcDir,
    options,
  };
}

/** Generates Vite library entries from a shared magic config. */
export function generateEntriesFromConfig(
  config: ViteMagicConfig,
  configDir: string = process.cwd(),
): EntryRecord {
  const resolved = resolveConfig(config, configDir);

  return generateEntries(resolved.rootDir, resolved.srcDir, resolved.options);
}

/** Loads `vite-magic.config.ts` through Vite's TypeScript-aware config loader. */
export async function loadConfig(
  searchRoot: string = process.cwd(),
  configFile?: string,
  options: LoadConfigOptions = {},
): Promise<LoadedViteMagicConfig | null> {
  let path = resolve(searchRoot, configFile ?? DEFAULT_CONFIG_FILE);

  if (!configFile && options.searchParents) {
    let directory = resolve(searchRoot);

    while (!existsSync(path)) {
      const parent = dirname(directory);

      if (parent === directory) {
        break;
      }

      directory = parent;
      path = resolve(directory, DEFAULT_CONFIG_FILE);
    }
  }

  if (!existsSync(path)) {
    if (configFile) {
      throw new Error(`Config file does not exist: ${path}`);
    }

    return null;
  }

  const { loadConfigFromFile } = await import('vite');
  const loaded = await loadConfigFromFile(
    { command: 'build', mode: 'production', isSsrBuild: false, isPreview: false },
    path,
    dirname(path),
    'silent',
  );

  if (!loaded) {
    throw new Error(`Could not load config file: ${path}`);
  }

  return {
    config: loaded.config as ViteMagicConfig,
    path: loaded.path,
  };
}
