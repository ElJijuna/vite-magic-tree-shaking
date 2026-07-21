import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateEntries } from './generateEntries.js';
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

type ParsedArguments = {
  command?: string;
  rootDir: string;
  srcDir: string;
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
  console.log('  --formats <es,cjs>   Emitted JavaScript formats (default: es,cjs)');
  console.log('  --out-dir <path>     JavaScript output directory (default: dist)');
  console.log('  --types-dir <path>   Declaration output directory (default: out-dir)');
  console.log('  --no-types           Omit the types condition');
  console.log('  --dry-run            Preview generate without writing package.json');
  console.log('  --prune              Remove exports not present in the generated map');
  console.log('  --strict             Treat additional exports as validation errors');
  console.log('  -h, --help           Show help');
  console.log('  -v, --version        Show version');
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
    rootDir: positionals[0] ? resolve(positionals[0]) : process.cwd(),
    srcDir: positionals[1] ?? 'src',
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

export function runCli(argv: string[]): number {
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

    const entries = generateEntries(args.rootDir, args.srcDir);
    const expected = entryRecordToExports(entries, {
      ...args.exportsOptions,
      sourceRoot: resolve(args.rootDir, args.srcDir),
    });
    const pkg = readPackageJson(args.rootDir);

    if (args.command === 'generate') {
      const nextExports = mergeExports(pkg.exports, expected, { prune: args.prune });

      if (exportsAreSynced(pkg.exports, nextExports)) {
        console.log('✓ package.json exports are already in sync');

        return 0;
      }

      const difference = diffExports(pkg.exports, expected);

      if (args.dryRun) {
        console.log('Package exports would be updated:');
      } else {
        pkg.exports = nextExports;
        writePackageJson(args.rootDir, pkg);
        console.log('✓ package.json exports updated:');
      }

      for (const key of [...difference.missing, ...difference.changed]) {
        console.log(`  ${key}`);
      }

      if (args.prune) {
        for (const key of difference.extra) {
          console.log(`  removed ${key}`);
        }
      }

      return 0;
    }

    const isSynced = exportsAreSynced(pkg.exports, expected, {
      allowExtra: !args.strict,
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

    if (args.strict && extra.length) {
      console.error(`  Extra   : ${extra.join(', ')}`);
    }

    if (changed.length) {
      console.error(`  Changed : ${changed.join(', ')}`);
    }

    console.error('');
    console.error('Run: npx vite-magic-tree-shaking generate');

    return 1;
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

if (isMainModule()) {
  process.exitCode = runCli(process.argv.slice(2));
}
