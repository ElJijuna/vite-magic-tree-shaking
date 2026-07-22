import { existsSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, posix, relative, resolve } from 'node:path';
import type { EntryRecord } from './generateEntries.js';

export interface ExportTargetConditions {
  [condition: string]: ExportTarget;
}

export type ExportTarget = string | ExportTargetConditions;

export type ExportConditions = ExportTargetConditions & {
  types?: string;
  import?: string;
  require?: string;
};

export type ExportsMap = Record<string, ExportConditions>;

export type ExportFormat = 'es' | 'cjs';

export type ExportConditionReference = 'types' | 'import' | 'require';

export type ExportConditionTemplate =
  | ExportConditionReference
  | `./${string}`
  | { readonly [condition: string]: ExportConditionTemplate };

export type CustomExportConditions = Readonly<Record<string, ExportConditionTemplate>>;

export type ExportsOptions = {
  /** Absolute source directory used to map declaration output paths. */
  sourceRoot?: string;
  /** JavaScript output directory relative to the package root. @default 'dist' */
  outDir?: string;
  /** Declaration output directory relative to the package root. Defaults to `outDir`. */
  typesOutDir?: string;
  /** JavaScript formats emitted by the build. @default ['es', 'cjs'] */
  formats?: readonly ExportFormat[];
  /** Include TypeScript declaration conditions. @default true */
  includeTypes?: boolean;
  /** ES module file extension. @default '.js' */
  importExtension?: string;
  /** CommonJS file extension. @default '.cjs' */
  requireExtension?: string;
  /** Additional package export conditions. `[name]` expands to the generated entry key. */
  conditions?: CustomExportConditions;
};

export type ResolvedExportsOptions = {
  sourceRoot?: string;
  outDir: string;
  typesOutDir: string;
  formats: readonly ExportFormat[];
  includeTypes: boolean;
  importExtension: string;
  requireExtension: string;
  conditions: CustomExportConditions;
};

export type ExportsComparisonOptions = {
  /** Ignore export keys not managed by the generated map. @default false */
  allowExtra?: boolean;
};

function normaliseRelativeOutputPath(path: string, optionName: string): string {
  const normalised = path.replace(/\\/g, '/').replace(/^\.\//, '');

  if (
    !normalised ||
    normalised.includes('\0') ||
    isAbsolute(path) ||
    /^[A-Za-z]:\//.test(normalised) ||
    normalised === '..' ||
    normalised.startsWith('../')
  ) {
    throw new Error(`${optionName} must be a non-empty path inside the package`);
  }

  return normalised.replace(/\/$/, '');
}

function validateEntryKey(key: string): void {
  const normalised = key.replace(/\\/g, '/');

  if (
    !normalised ||
    normalised.startsWith('/') ||
    normalised.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error(`Invalid entry key: ${key}`);
  }
}

function validateExtension(extension: string, optionName: string): string {
  if (!/^\.[A-Za-z0-9]+$/.test(extension)) {
    throw new Error(`${optionName} must be a file extension such as .js or .cjs`);
  }

  return extension;
}

/** Resolves and validates the output contract shared by Vite, the CLI, and package exports. */
export function resolveExportsOptions(options: ExportsOptions = {}): ResolvedExportsOptions {
  const outDir = normaliseRelativeOutputPath(options.outDir ?? 'dist', 'outDir');
  const formats = [...new Set<ExportFormat>(options.formats ?? ['es', 'cjs'])];

  if (formats.some((format) => format !== 'es' && format !== 'cjs')) {
    throw new Error('formats accepts only es and cjs');
  }

  return {
    sourceRoot: options.sourceRoot,
    outDir,
    typesOutDir: normaliseRelativeOutputPath(options.typesOutDir ?? outDir, 'typesOutDir'),
    formats,
    includeTypes: options.includeTypes !== false,
    importExtension: validateExtension(options.importExtension ?? '.js', 'importExtension'),
    requireExtension: validateExtension(options.requireExtension ?? '.cjs', 'requireExtension'),
    conditions: options.conditions ?? {},
  };
}

function validateConditionName(condition: string): void {
  if (
    !condition ||
    condition.startsWith('.') ||
    condition.includes(',') ||
    /^\d+$/.test(condition)
  ) {
    throw new Error(`Invalid export condition: ${condition}`);
  }
}

function validateConditionTarget(target: string): string {
  const normalised = target.replace(/\\/g, '/');

  if (
    !normalised.startsWith('./') ||
    normalised.includes('\0') ||
    normalised.split('/').some((segment) => segment === '..')
  ) {
    throw new Error(`Export condition target must stay inside the package: ${target}`);
  }

  return normalised;
}

function resolveConditionTarget(
  template: ExportConditionTemplate,
  entryName: string,
  references: Partial<Record<ExportConditionReference, string>>,
): ExportTarget {
  if (typeof template === 'string') {
    if (template === 'types' || template === 'import' || template === 'require') {
      const target = references[template];

      if (!target) {
        throw new Error(`Export condition references disabled target: ${template}`);
      }

      return target;
    }

    return validateConditionTarget(template.replaceAll('[name]', entryName));
  }

  const result: ExportTargetConditions = {};
  const entries = Object.entries(template);
  const orderedEntries = [
    ...entries.filter(([condition]) => condition !== 'default'),
    ...entries.filter(([condition]) => condition === 'default'),
  ];

  for (const [condition, nested] of orderedEntries) {
    validateConditionName(condition);
    result[condition] = resolveConditionTarget(nested, entryName, references);
  }

  return result;
}

function packageTarget(...parts: string[]): string {
  return `./${posix.join(...parts)}`;
}

function declarationExtension(sourcePath: string): string {
  const extension = extname(sourcePath);

  if (extension === '.mts') {
    return '.d.mts';
  }

  if (extension === '.cts') {
    return '.d.cts';
  }

  return '.d.ts';
}

function declarationPath(key: string, sourcePath: string, options: ResolvedExportsOptions): string {
  let sourceRelativePath = key;

  if (options.sourceRoot) {
    sourceRelativePath = relative(options.sourceRoot, sourcePath).replace(/\\/g, '/');

    if (
      isAbsolute(sourceRelativePath) ||
      sourceRelativePath === '..' ||
      sourceRelativePath.startsWith('../')
    ) {
      throw new Error(`Entry is outside sourceRoot: ${sourcePath}`);
    }
  }

  const extension = extname(sourceRelativePath);
  const withoutExtension = extension
    ? sourceRelativePath.slice(0, -extension.length)
    : sourceRelativePath;

  return packageTarget(
    options.typesOutDir,
    `${withoutExtension}${declarationExtension(sourcePath)}`,
  );
}

export function entryRecordToExports(
  entries: EntryRecord,
  options: ExportsOptions = {},
): ExportsMap {
  const result = Object.create(null) as ExportsMap;
  const resolvedOptions = resolveExportsOptions(options);
  const formats = new Set(resolvedOptions.formats);

  for (const key of Object.keys(entries).sort()) {
    validateEntryKey(key);
    const exportKey = key === 'index' ? '.' : `./${key}`;
    const conditions: ExportConditions = {};
    const references: Partial<Record<ExportConditionReference, string>> = {};

    if (resolvedOptions.includeTypes) {
      references.types = declarationPath(key, entries[key], resolvedOptions);
    }

    if (formats.has('es')) {
      references.import = packageTarget(
        resolvedOptions.outDir,
        `${key}${resolvedOptions.importExtension}`,
      );
    }

    if (formats.has('cjs')) {
      references.require = packageTarget(
        resolvedOptions.outDir,
        `${key}${resolvedOptions.requireExtension}`,
      );
    }

    if (references.types) {
      conditions.types = references.types;
    }

    for (const [condition, template] of Object.entries(resolvedOptions.conditions)) {
      validateConditionName(condition);

      if (condition === 'types' || condition === 'import' || condition === 'require') {
        throw new Error(`Custom export condition conflicts with built-in condition: ${condition}`);
      }

      if (condition === 'default') {
        continue;
      }

      conditions[condition] = resolveConditionTarget(template, key, references);
    }

    if (references.import) {
      conditions.import = references.import;
    }

    if (references.require) {
      conditions.require = references.require;
    }

    if (Object.hasOwn(resolvedOptions.conditions, 'default')) {
      conditions.default = resolveConditionTarget(
        resolvedOptions.conditions.default,
        key,
        references,
      );
    }

    if (Object.keys(conditions).length === 0) {
      throw new Error('At least one export condition must be enabled');
    }

    result[exportKey] = conditions;
  }

  return result;
}

export function readPackageJson(rootDir: string): Record<string, unknown> {
  const pkgPath = resolve(rootDir, 'package.json');
  const parsed = JSON.parse(readFileSync(pkgPath, 'utf-8')) as unknown;

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`package.json must contain a JSON object: ${pkgPath}`);
  }

  return parsed as Record<string, unknown>;
}

export function writePackageJson(rootDir: string, pkg: Record<string, unknown>): void {
  const pkgPath = resolve(rootDir, 'package.json');
  const original = readFileSync(pkgPath, 'utf-8');
  const indentMatch = original.match(/\n([ \t]+)"/);
  const indent = indentMatch?.[1] ?? '  ';
  const finalNewline = original.endsWith('\n') ? '\n' : '';
  const temporaryPath = resolve(
    dirname(pkgPath),
    `.${basename(pkgPath)}.${process.pid}.${Date.now()}.tmp`,
  );

  try {
    writeFileSync(temporaryPath, JSON.stringify(pkg, null, indent) + finalNewline, {
      encoding: 'utf-8',
      flag: 'wx',
      mode: statSync(pkgPath).mode,
    });
    renameSync(temporaryPath, pkgPath);
  } catch (error) {
    if (existsSync(temporaryPath)) {
      unlinkSync(temporaryPath);
    }

    throw error;
  }
}

export function exportsAreSynced(
  current: unknown,
  expected: Record<string, unknown>,
  options: ExportsComparisonOptions = {},
): boolean {
  const difference = diffExports(current, expected);

  return (
    difference.missing.length === 0 &&
    difference.changed.length === 0 &&
    (options.allowExtra === true || difference.extra.length === 0)
  );
}

export type ExportsDiff = {
  missing: string[];
  extra: string[];
  changed: string[];
};

export function diffExports(current: unknown, expected: Record<string, unknown>): ExportsDiff {
  const cur = (
    current && typeof current === 'object' && !Array.isArray(current) ? current : {}
  ) as Record<string, unknown>;
  const missing: string[] = [];
  const extra: string[] = [];
  const changed: string[] = [];

  for (const key of Object.keys(expected)) {
    if (!(key in cur)) {
      missing.push(key);
    } else if (JSON.stringify(cur[key]) !== JSON.stringify(expected[key])) {
      changed.push(key);
    }
  }

  for (const key of Object.keys(cur)) {
    if (!(key in expected)) {
      extra.push(key);
    }
  }

  return { missing, extra, changed };
}

export function mergeExports(
  current: unknown,
  expected: ExportsMap,
  options: { prune?: boolean } = {},
): Record<string, unknown> {
  const currentMap = (
    current && typeof current === 'object' && !Array.isArray(current) ? current : {}
  ) as Record<string, unknown>;
  const merged = Object.create(null) as Record<string, unknown>;

  if (!options.prune) {
    for (const key of Object.keys(currentMap)) {
      merged[key] = currentMap[key];
    }
  }

  for (const key of Object.keys(expected)) {
    merged[key] = expected[key];
  }

  return merged;
}
