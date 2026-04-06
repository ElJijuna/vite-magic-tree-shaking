/** @type {import('typedoc').TypeDocOptions} */
module.exports = {
  entryPoints: ['src/index.ts'],
  out: 'docs',
  name: 'vite-magic-tree-shaking',
  readme: 'README.md',
  includeVersion: true,
  navigationLinks: {
    'npm': 'https://www.npmjs.com/package/vite-magic-tree-shaking',
    'GitHub': 'https://github.com/ElJijuna/vite-magic-tree-shaking',
  },
  excludePrivate: true,
  excludeInternal: true,
  plugin: [],
}
