import { createEslintConfig } from 'super-configs/eslint';
import eslintVitest from 'super-configs/eslint/vitest';

export default [
  ...createEslintConfig({
    runtime: 'node',
    language: 'ts',
    typeChecked: true,
    ignores: [
      'dist/**',
      'coverage/**',
      'docs/**',
      'node_modules/**',
      'test/fixtures/**',
      'vite.config*.ts',
      'vitest.config.ts',
    ],
  }),
  ...eslintVitest,
];
