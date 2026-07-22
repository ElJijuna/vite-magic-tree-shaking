import { existsSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, mergeConfig, resolveConfig, type ViteMagicConfig } from './config.js';
import { type GenerateEntriesOptions, generateEntries } from './generateEntries.js';
import {
  diffExports,
  type ExportFormat,
  type ExportsOptions,
  entryRecordToExports,
  exportsAreSynced,
  mergeExports,
  readPackageJson,
  writePackageJson,
} from './syncExports.js';
import { findWorkspacePackages } from './workspaces.js';

type Command = 'generate' | 'validate';

type ParsedArguments = {
  command?: string;
  rootDir?: string;
  srcDir?: string;
  configFile?: string;
  exportsOptions: Omit<ExportsOptions, 'sourceRoot'>;
  dryRun: boolean;
  prune: boolean;
  strict: boolean;
  help: boolean;
  version: boolean;
};

function printUsage(): void {
  console.log('Usage: vite-magic <command> [rootDir] [srcDir] [options]');
  console.log('');
  console.log('Commands:');
  console.log('  generate  Merge generated exports into package.json');
  console.log('  validate  Check generated exports against package.json');
  console.log('');
  console.log('Options:');
  console.log('  --config <path>      Config file (default: vite-magic.config.ts)');
  console.log('  --formats <es,cjs>   Emitted JavaScript formats (default: es,cjs)');
  console.log('  --out-dir <path>     JavaScript output directory (default: dist)');
  console.log('  --types-dir <path>   Declaration output directory (default: out-dir)');
  console.log('  --no-types           Omit the types condition');
  console.log('  --dry-run            Preview generate without writing package.json');
  console.log('  --prune              Remove exports not present in the generated map');
  console.log('  --strict             Treat additional exports as validation errors');
  console.log('  -h, --help           Show help');
  console.log('  -v, --version        Show version');
  console.log('');
  console.log('Workspaces in package.json or pnpm-workspace.yaml are processed automatically.');
}

function optionValue(argv: string[], index: number, option: string): [string, number] {
  const [, inline] = argv[index].split('=', 2);

  if (inline) {
    return [inline, index];
  }

  const value = argv[index + 1];

  if (!value || value.startsWith('-')) {
    throw new Error(`${option} requires a value`);
  }

  return [value, index + 1];
}

function parseFormats(value: string): ExportFormat[] {
  const formats = value.split(',').filter(Boolean);

  if (formats.length === 0 || formats.some((format) => format !== 'es' && format !== 'cjs')) {
    throw new Error('--formats accepts only es and cjs');
  }

  return [...new Set(formats)] as ExportFormat[];
}

function parseArguments(argv: string[]): ParsedArguments {
  const positionals: string[] = [];
  const exportsOptions: Omit<ExportsOptions, 'sourceRoot'> = {};

  let command: string | undefined;
  let dryRun = false;
  let prune = false;
  let strict = false;
  let help = false;
  let version = false;
  let configFile: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '-h' || argument === '--help') {
      help = true;
    } else if (argument === '-v' || argument === '--version') {
      version = true;
    } else if (argument === '--dry-run') {
      dryRun = true;
    } else if (argument === '--prune') {
      prune = true;
    } else if (argument === '--strict') {
      strict = true;
    } else if (argument === '--no-types') {
      exportsOptions.includeTypes = false;
    } else if (argument === '--config' || argument.startsWith('--config=')) {
      const [value, nextIndex] = optionValue(argv, index, '--config');

      configFile = value;
      index = nextIndex;
    } else if (argument === '--formats' || argument.startsWith('--formats=')) {
      const [value, nextIndex] = optionValue(argv, index, '--formats');

      exportsOptions.formats = parseFormats(value);
      index = nextIndex;
    } else if (argument === '--out-dir' || argument.startsWith('--out-dir=')) {
      const [value, nextIndex] = optionValue(argv, index, '--out-dir');

      exportsOptions.outDir = value;
      index = nextIndex;
    } else if (argument === '--types-dir' || argument.startsWith('--types-dir=')) {
      const [value, nextIndex] = optionValue(argv, index, '--types-dir');

      exportsOptions.typesOutDir = value;
      index = nextIndex;
    } else if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`);
    } else if (!command) {
      command = argument;
    } else {
      positionals.push(argument);
    }
  }

  if (positionals.length > 2) {
    throw new Error('Too many positional arguments');
  }

  return {
    command,
    rootDir: positionals[0] ? resolve(positionals[0]) : undefined,
    srcDir: positionals[1],
    configFile,
    exportsOptions,
    dryRun,
    prune,
    strict,
    help,
    version,
  };
}

function packageVersion(): string {
  try {
    return String(readPackageJson(resolve(import.meta.dirname, '..')).version);
  } catch {
    return 'unknown';
  }
}

type ProjectRunOptions = {
  command: Command;
  rootDir: string;
  srcDir: string;
  generateOptions: GenerateEntriesOptions;
  exportsOptions: Omit<ExportsOptions, 'sourceRoot'>;
  dryRun: boolean;
  prune: boolean;
  strict: boolean;
};

function runProject(options: ProjectRunOptions): number {
  const { command, rootDir, srcDir, generateOptions, exportsOptions, dryRun, prune, strict } =
    options;
  const entries = generateEntries(rootDir, srcDir, generateOptions);
  const expected = entryRecordToExports(entries, {
    ...exportsOptions,
    sourceRoot: resolve(rootDir, srcDir),
  });
  const pkg = readPackageJson(rootDir);

  if (command === 'generate') {
    const nextExports = mergeExports(pkg.exports, expected, { prune });

    if (exportsAreSynced(pkg.exports, nextExports)) {
      console.log('✓ package.json exports are already in sync');

      return 0;
    }

    const difference = diffExports(pkg.exports, expected);

    if (dryRun) {
      console.log('Package exports would be updated:');
    } else {
      pkg.exports = nextExports;
      writePackageJson(rootDir, pkg);
      console.log('✓ package.json exports updated:');
    }

    for (const key of [...difference.missing, ...difference.changed]) {
      console.log(`  ${key}`);
    }

    if (prune) {
      for (const key of difference.extra) {
        console.log(`  removed ${key}`);
      }
    }

    return 0;
  }

  const isSynced = exportsAreSynced(pkg.exports, expected, {
    allowExtra: !strict,
  });

  if (isSynced) {
    console.log('✓ package.json exports are in sync');

    return 0;
  }

  const { missing, extra, changed } = diffExports(pkg.exports, expected);

  console.error('✗ package.json exports are out of sync with src entries');

  if (missing.length) {
    console.error(`  Missing : ${missing.join(', ')}`);
  }

  if (strict && extra.length) {
    console.error(`  Extra   : ${extra.join(', ')}`);
  }

  if (changed.length) {
    console.error(`  Changed : ${changed.join(', ')}`);
  }

  console.error('');
  console.error('Run: npx vite-magic-tree-shaking generate');

  return 1;
}

function projectRunOptions(
  command: Command,
  resolvedConfig: ReturnType<typeof resolveConfig>,
  args: ParsedArguments,
): ProjectRunOptions {
  const srcDir = args.srcDir ?? resolvedConfig.srcDir;
  const exportsOptions = {
    ...resolvedConfig.options.exports,
    ...args.exportsOptions,
  };

  return {
    command,
    rootDir: resolvedConfig.rootDir,
    srcDir,
    generateOptions: {
      ...resolvedConfig.options,
      exports: exportsOptions,
    },
    exportsOptions,
    dryRun: args.dryRun,
    prune: args.prune,
    strict: args.strict,
  };
}

export async function runCli(argv: string[]): Promise<number> {
  try {
    const args = parseArguments(argv);

    if (args.version) {
      console.log(packageVersion());

      return 0;
    }

    if (args.help || !args.command) {
      printUsage();

      return 0;
    }

    if (args.command !== 'generate' && args.command !== 'validate') {
      throw new Error(`Unknown command: ${args.command}`);
    }

    if (args.command !== 'generate' && (args.dryRun || args.prune)) {
      throw new Error('--dry-run and --prune are only valid with generate');
    }

    if (args.command !== 'validate' && args.strict) {
      throw new Error('--strict is only valid with validate');
    }

    const { command } = args;
    const searchRoot = args.rootDir ?? process.cwd();
    const loadedConfig = await loadConfig(searchRoot, args.configFile);
    const configDir = loadedConfig ? dirname(loadedConfig.path) : searchRoot;
    const rootConfig = loadedConfig?.config ?? {};
    const resolvedRootConfig = resolveConfig(rootConfig, configDir);
    const monorepoRoot = args.rootDir ?? resolvedRootConfig.rootDir;
    const workspaces = existsSync(resolve(monorepoRoot, 'package.json'))
      ? findWorkspacePackages(monorepoRoot)
      : [];

    if (workspaces.length === 0) {
      return runProject(
        projectRunOptions(command, { ...resolvedRootConfig, rootDir: monorepoRoot }, args),
      );
    }

    const workspaceDefaults: ViteMagicConfig = { ...rootConfig };

    delete workspaceDefaults.rootDir;

    let exitCode = 0;

    for (const workspace of workspaces) {
      console.log(`\n${workspace.name} (${workspace.relativePath})`);

      try {
        const localConfig = await loadConfig(workspace.rootDir);
        const mergedConfig = mergeConfig(workspaceDefaults, localConfig?.config ?? {});
        const localConfigDir = localConfig ? dirname(localConfig.path) : workspace.rootDir;
        const resolvedWorkspaceConfig = resolveConfig(mergedConfig, localConfigDir);
        const result = runProject(projectRunOptions(command, resolvedWorkspaceConfig, args));

        if (result !== 0) {
          exitCode = 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        console.error(`✗ vite-magic (${workspace.name}): ${message}`);
        exitCode = 1;
      }
    }

    return exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error(`✗ vite-magic: ${message}`);

    return 1;
  }
}

function isMainModule(): boolean {
  if (!process.argv[1]) {
    return false;
  }

  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  process.exitCode = await runCli(process.argv.slice(2));
}

if (isMainModule()) {
  void main();
}
