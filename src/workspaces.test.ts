import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findWorkspacePackages, findWorkspaceRoot } from './workspaces.js';

let root: string | undefined;

afterEach(() => {
  if (root) {
    rmSync(root, { recursive: true, force: true });
  }

  root = undefined;
});

function monorepo(workspaces: unknown): string {
  root = mkdtempSync(join(tmpdir(), 'vite-magic-workspaces-'));
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({ private: true, workspaces })}\n`);

  return root;
}

function workspace(monorepoRoot: string, path: string, name: string): void {
  const directory = join(monorepoRoot, path);

  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'package.json'), `${JSON.stringify({ name })}\n`);
}

describe('findWorkspacePackages', () => {
  it('discovers array workspaces in stable path order', () => {
    const project = monorepo(['packages/*']);

    workspace(project, 'packages/zeta', '@fixture/zeta');
    workspace(project, 'packages/alpha', '@fixture/alpha');
    workspace(project, 'other/ignored', '@fixture/ignored');

    expect(findWorkspacePackages(project)).toEqual([
      {
        name: '@fixture/alpha',
        relativePath: 'packages/alpha',
        rootDir: join(project, 'packages/alpha'),
      },
      {
        name: '@fixture/zeta',
        relativePath: 'packages/zeta',
        rootDir: join(project, 'packages/zeta'),
      },
    ]);
  });

  it('supports object syntax, recursive globs, braces, and exclusions', () => {
    const project = monorepo({
      packages: ['{packages,apps}/**', '!packages/private/**'],
    });

    workspace(project, 'packages/ui', '@fixture/ui');
    workspace(project, 'packages/private/secret', '@fixture/secret');
    workspace(project, 'apps/docs/site', '@fixture/docs');

    expect(findWorkspacePackages(project).map(({ name }) => name)).toEqual([
      '@fixture/docs',
      '@fixture/ui',
    ]);
  });

  it('discovers pnpm workspace packages and exclusions', () => {
    const project = monorepo(undefined);

    writeFileSync(
      join(project, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n  - '!packages/private/**'\n",
    );
    workspace(project, 'packages/ui', '@fixture/ui');
    workspace(project, 'packages/private/secret', '@fixture/secret');

    expect(findWorkspacePackages(project).map(({ name }) => name)).toEqual(['@fixture/ui']);
  });

  it('returns no packages when workspaces are not declared', () => {
    const project = monorepo(undefined);

    expect(findWorkspacePackages(project)).toEqual([]);
  });

  it('finds only a parent that declares the package as a workspace', () => {
    const project = monorepo(['packages/*']);
    const workspaceRoot = join(project, 'packages/ui');

    workspace(project, 'packages/ui', '@fixture/ui');
    workspace(project, 'other/standalone', '@fixture/standalone');

    expect(findWorkspaceRoot(workspaceRoot)).toBe(project);
    expect(findWorkspaceRoot(join(project, 'other/standalone'))).toBeNull();
  });
});
