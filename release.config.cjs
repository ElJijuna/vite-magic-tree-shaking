module.exports = {
  branches: ['main'],
  plugins: [
    '@semantic-release/commit-analyzer',
    ['@semantic-release/release-notes-generator', { preset: 'conventionalcommits' }],
    [
      '@semantic-release/changelog',
      { changelogFile: 'CHANGELOG.md', changelogTitle: '# Changelog' },
    ],
    '@semantic-release/npm',
    '@semantic-release/github',
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'package.json'],
        // biome-ignore lint/suspicious/noTemplateCurlyInString: semantic-release interpolates this placeholder.
        message: 'chore(release): ${nextRelease.version} [skip ci]',
      },
    ],
  ],
};
