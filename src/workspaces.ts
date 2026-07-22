import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { parse } from 'yaml';
import { readPackageJson } from './syncExports.js';

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
]);

export interface WorkspacePackage {
  name: string;
  relativePath: string;
  rootDir: string;
}

function packageWorkspacePatterns(pkg: Record<string, unknown>): string[] {
  const { workspaces } = pkg;

  if (Array.isArray(workspaces)) {
    return workspaces.filter((pattern): pattern is string => typeof pattern === 'string');
  }

  if (workspaces && typeof workspaces === 'object' && !Array.isArray(workspaces)) {
    const { packages } = workspaces as Record<string, unknown>;

    if (Array.isArray(packages)) {
      return packages.filter((pattern): pattern is string => typeof pattern === 'string');
    }
  }

  return [];
}

function pnpmWorkspacePatterns(rootDir: string): string[] {
  const workspacePath = resolve(rootDir, 'pnpm-workspace.yaml');

  if (!existsSync(workspacePath)) {
    return [];
  }

  const document = parse(readFileSync(workspacePath, 'utf-8')) as unknown;

  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error(`pnpm-workspace.yaml must contain a YAML object: ${workspacePath}`);
  }

  const { packages } = document as Record<string, unknown>;

  if (!Array.isArray(packages)) {
    return [];
  }

  return packages.filter((pattern): pattern is string => typeof pattern === 'string');
}

function workspacePatterns(pkg: Record<string, unknown>, rootDir: string): string[] {
  return [...new Set([...packageWorkspacePatterns(pkg), ...pnpmWorkspacePatterns(rootDir)])];
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globRegex(pattern: string): RegExp {
  const normalised = pattern.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');

  let source = '';

  for (let index = 0; index < normalised.length; index += 1) {
    const character = normalised[index];

    if (character === '*') {
      if (normalised[index + 1] === '*') {
        index += 1;

        if (normalised[index + 1] === '/') {
          index += 1;
          source += '(?:.*/)?';
        } else {
          source += '.*';
        }
      } else {
        source += '[^/]*';
      }
    } else if (character === '?') {
      source += '[^/]';
    } else if (character === '{') {
      const closing = normalised.indexOf('}', index + 1);

      if (closing === -1) {
        source += '\\{';
      } else {
        const alternatives = normalised
          .slice(index + 1, closing)
          .split(',')
          .map(escapeRegex);

        source += `(?:${alternatives.join('|')})`;
        index = closing;
      }
    } else {
      source += escapeRegex(character);
    }
  }

  return new RegExp(`^${source}$`);
}

/** Discovers package roots declared by npm/Yarn workspaces or pnpm-workspace.yaml. */
export function findWorkspacePackages(rootDir: string): WorkspacePackage[] {
  const rootPackage = readPackageJson(rootDir);
  const patterns = workspacePatterns(rootPackage, rootDir);

  if (patterns.length === 0) {
    return [];
  }

  const includes = patterns.filter((pattern) => !pattern.startsWith('!')).map(globRegex);
  const excludes = patterns
    .filter((pattern) => pattern.startsWith('!'))
    .map((pattern) => globRegex(pattern.slice(1)));
  const packages: WorkspacePackage[] = [];

  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      const child = resolve(directory, entry.name);
      const relativePath = relative(rootDir, child).replace(/\\/g, '/');
      const included = includes.some((pattern) => pattern.test(relativePath));
      const excluded = excludes.some((pattern) => pattern.test(relativePath));

      if (included && !excluded) {
        try {
          const pkg = readPackageJson(child);

          packages.push({
            name: typeof pkg.name === 'string' ? pkg.name : relativePath,
            relativePath,
            rootDir: child,
          });
        } catch {
          // A matched directory without a readable package.json is not a workspace package.
        }
      }

      visit(child);
    }
  }

  visit(rootDir);

  return packages.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

/** Finds the closest parent that explicitly declares `packageDir` as a workspace. */
export function findWorkspaceRoot(packageDir: string): string | null {
  const packageRoot = resolve(packageDir);

  let directory = resolve(packageRoot, '..');

  while (true) {
    if (existsSync(resolve(directory, 'package.json'))) {
      try {
        const containsPackage = findWorkspacePackages(directory).some(
          (workspace) => resolve(workspace.rootDir) === packageRoot,
        );

        if (containsPackage) {
          return directory;
        }
      } catch {
        // Ignore unrelated parent manifests that are not valid workspace roots.
      }
    }

    const parent = resolve(directory, '..');

    if (parent === directory) {
      return null;
    }

    directory = parent;
  }
}
