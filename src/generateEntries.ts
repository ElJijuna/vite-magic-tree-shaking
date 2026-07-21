import { readdirSync, realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  type ExportsOptions,
  entryRecordToExports,
  exportsAreSynced,
  readPackageJson,
} from './syncExports.js';

export type EntryRecord = Record<string, string>;

export interface GenerateEntriesOptions {
  /**
   * When `true`, compares the generated entries against `package.json` exports
   * and emits a `console.warn` if they are out of sync.
   *
   * Useful in `vite.config.ts` to catch forgotten `vite-magic generate` runs
   * at build/dev time.
   *
   * @default false
   */
  warnOnExportsMismatch?: boolean;

  /** Follow symbolic links that remain inside `srcDir`. @default false */
  followSymlinks?: boolean;

  /** Called for files and directories. Return `true` to exclude the path. */
  exclude?: (relativePath: string) => boolean;

  /** Called for valid source files. Return `true` to include the file. */
  include?: (relativePath: string) => boolean;

  /** How duplicate entry keys are handled. @default 'error' */
  onCollision?: 'error' | 'overwrite';

  /** Output contract used by `warnOnExportsMismatch`. */
  exports?: Omit<ExportsOptions, 'sourceRoot'>;
}

const VALID_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'];
const IGNORE_SUFFIXES = ['.test.', '.spec.', '.stories.', '.d.ts', '.d.mts', '.d.cts'];
const DEFAULT_IGNORED_DIRECTORIES = new Set(['.git', 'node_modules']);

type ScanOptions = Pick<
  GenerateEntriesOptions,
  'followSymlinks' | 'exclude' | 'include' | 'onCollision'
>;

type ScanContext = {
  absoluteSrc: string;
  realSrc: string;
  entries: EntryRecord;
  options: ScanOptions;
  visitedDirectories: Set<string>;
};

function isValidEntryFile(name: string): boolean {
  const ext = extname(name);

  if (!VALID_EXTENSIONS.includes(ext)) {
    return false;
  }

  return !IGNORE_SUFFIXES.some((suffix) => name.includes(suffix));
}

function stripExtension(filePath: string): string {
  const ext = extname(filePath);

  return filePath.slice(0, -ext.length);
}

function toPosixPath(filePath: string): string {
  return filePath.split(sep).join('/').replace(/\\/g, '/');
}

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);

  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

function relativePath(context: ScanContext, absolutePath: string): string {
  return toPosixPath(relative(context.absoluteSrc, absolutePath));
}

function classifyPath(
  absolutePath: string,
  isDirectory: boolean,
  isFile: boolean,
  isSymbolicLink: boolean,
  context: ScanContext,
): 'directory' | 'file' | 'skip' {
  let directory = isDirectory;
  let file = isFile;

  if (isSymbolicLink) {
    if (!context.options.followSymlinks) {
      return 'skip';
    }

    let target: string;

    try {
      target = realpathSync(absolutePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      throw new Error(`Cannot resolve symbolic link ${absolutePath}: ${message}`);
    }

    if (!isInside(context.realSrc, target)) {
      throw new Error(`Symbolic link escapes source directory: ${absolutePath} -> ${target}`);
    }

    const targetStat = statSync(absolutePath);

    directory = targetStat.isDirectory();
    file = targetStat.isFile();
  }

  const rel = relativePath(context, absolutePath);

  if (context.options.exclude?.(rel)) {
    return 'skip';
  }

  if (directory) {
    const segments = rel.split('/');
    const name = segments[segments.length - 1];

    if (name && DEFAULT_IGNORED_DIRECTORIES.has(name)) {
      return 'skip';
    }

    return 'directory';
  }

  if (file) {
    return 'file';
  }

  return 'skip';
}

function setEntry(context: ScanContext, key: string, filePath: string): void {
  if (
    Object.hasOwn(context.entries, key) &&
    context.entries[key] !== filePath &&
    context.options.onCollision !== 'overwrite'
  ) {
    throw new Error(`Duplicate entry key "${key}" for ${context.entries[key]} and ${filePath}`);
  }

  context.entries[key] = filePath;
}

function scanDir(dirPath: string, context: ScanContext, isRoot: boolean): void {
  const realDirectory = realpathSync(dirPath);

  if (context.visitedDirectories.has(realDirectory)) {
    return;
  }

  context.visitedDirectories.add(realDirectory);

  const items = readdirSync(dirPath, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  // Non-root directories: if an index exists, register it and only recurse into subdirs
  if (!isRoot) {
    const indexFiles = items
      .filter((item) => VALID_EXTENSIONS.some((ext) => item.name === `index${ext}`))
      .map((item) => ({
        item,
        path: join(dirPath, item.name),
      }))
      .filter(
        ({ item, path }) =>
          classifyPath(path, item.isDirectory(), item.isFile(), item.isSymbolicLink(), context) ===
          'file',
      )
      .filter(({ path }) => {
        const rel = relativePath(context, path);

        return !context.options.include || context.options.include(rel);
      });

    if (indexFiles.length > 1) {
      throw new Error(
        `Multiple index files produce the same entry: ${indexFiles.map(({ path }) => path).join(', ')}`,
      );
    }

    const indexFile = indexFiles[0]?.path;

    if (indexFile) {
      // key = "Users" (the dir name relative to src root)
      const key = relativePath(context, dirPath);

      setEntry(context, key, indexFile);

      for (const item of items) {
        const itemPath = join(dirPath, item.name);

        if (
          classifyPath(
            itemPath,
            item.isDirectory(),
            item.isFile(),
            item.isSymbolicLink(),
            context,
          ) === 'directory'
        ) {
          scanDir(itemPath, context, false);
        }
      }

      return;
    }
  }

  // Root or dirs without an index: register every valid file + recurse into subdirs
  for (const item of items) {
    const itemPath = join(dirPath, item.name);
    const kind = classifyPath(
      itemPath,
      item.isDirectory(),
      item.isFile(),
      item.isSymbolicLink(),
      context,
    );

    if (kind === 'directory') {
      scanDir(itemPath, context, false);
    } else if (kind === 'file' && isValidEntryFile(item.name)) {
      // key = "index" | "Users/Users" | "Users/domain/user"
      const rel = relativePath(context, itemPath);

      if (!context.options.include || context.options.include(rel)) {
        setEntry(context, stripExtension(rel), itemPath);
      }
    }
  }
}

/**
 * Generates a tree-shakeable entry map for Vite `build.lib.entry`.
 *
 * Rules (applied per directory inside `srcDir`):
 *  - `src/index.ts`               → `{ index: '…/src/index.ts' }`
 *  - `src/Users/index.ts`         → `{ Users: '…/src/Users/index.ts' }`
 *  - `src/Users/Users.tsx`        → `{ 'Users/Users': '…/src/Users/Users.tsx' }`
 *  - `src/Users/domain/user.ts`   → `{ 'Users/domain/user': '…/src/Users/domain/user.ts' }`
 *
 * @param rootDir  Absolute path to the project root (pass `__dirname` or
 *                 `fileURLToPath(new URL('.', import.meta.url))`)
 * @param srcDir   Source directory name relative to `rootDir` (default: `'src'`)
 * @param options  Optional configuration
 */
export function generateEntries(
  rootDir: string,
  srcDir: string = 'src',
  options: GenerateEntriesOptions = {},
): EntryRecord {
  const absoluteSrc = resolve(rootDir, srcDir);

  let realSrc: string;

  try {
    realSrc = realpathSync(absoluteSrc);
  } catch {
    throw new Error(`Source directory does not exist or is unreadable: ${absoluteSrc}`);
  }

  if (!statSync(absoluteSrc).isDirectory()) {
    throw new Error(`Source path is not a directory: ${absoluteSrc}`);
  }

  const entries = Object.create(null) as EntryRecord;
  const context: ScanContext = {
    absoluteSrc,
    realSrc,
    entries,
    options,
    visitedDirectories: new Set(),
  };

  scanDir(absoluteSrc, context, true);

  if (options.warnOnExportsMismatch) {
    try {
      const pkg = readPackageJson(rootDir);
      const expected = entryRecordToExports(entries, {
        ...options.exports,
        sourceRoot: absoluteSrc,
      });

      if (!exportsAreSynced(pkg.exports, expected, { allowExtra: true })) {
        console.warn(
          '[vite-magic-tree-shaking] package.json exports are out of sync with src entries.\n' +
            'Run: npx vite-magic-tree-shaking generate',
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      console.warn(`[vite-magic-tree-shaking] Could not validate package exports: ${message}`);
    }
  }

  return entries;
}
