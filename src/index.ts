export type {
  LoadedViteMagicConfig,
  ResolvedViteMagicConfig,
  ViteMagicConfig,
} from './config.js';
export {
  DEFAULT_CONFIG_FILE,
  defineConfig,
  generateEntriesFromConfig,
  loadConfig,
  resolveConfig,
} from './config.js';
export type { EntryRecord, GenerateEntriesOptions } from './generateEntries.js';
export { generateEntries } from './generateEntries.js';
export type { ViteMagicPluginOptions } from './plugin.js';
export { viteMagic } from './plugin.js';
export type {
  ExportConditions,
  ExportFormat,
  ExportsComparisonOptions,
  ExportsDiff,
  ExportsMap,
  ExportsOptions,
  ResolvedExportsOptions,
} from './syncExports.js';
export {
  diffExports,
  entryRecordToExports,
  exportsAreSynced,
  mergeExports,
  resolveExportsOptions,
} from './syncExports.js';
