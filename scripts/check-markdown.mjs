import { lint, readConfig } from 'markdownlint/sync';

const config = readConfig('.markdownlint.json');
const results = lint({
  files: ['README.md', 'CHANGELOG.md'],
  config,
});
const output = results.toString();

if (output) {
  console.error(output);
  process.exitCode = 1;
} else {
  console.log('Markdown OK');
}
