export type {
  LoadConfigOptions,
  LoadedViteMagicConfig,
  ResolvedViteMagicConfig,
  ViteMagicConfig,
} from './config.js';
export {
  DEFAULT_CONFIG_FILE,
  defineConfig,
  generateEntriesFromConfig,
  loadConfig,
  mergeConfig,
  resolveConfig,
} from './config.js';
export type { EntryRecord, GenerateEntriesOptions } from './generateEntries.js';
export { generateEntries } from './generateEntries.js';
export type { ViteMagicPluginOptions } from './plugin.js';
export { viteMagic } from './plugin.js';
export type {
  CustomExportConditions,
  ExportConditionReference,
  ExportConditions,
  ExportConditionTemplate,
  ExportFormat,
  ExportsComparisonOptions,
  ExportsDiff,
  ExportsMap,
  ExportsOptions,
  ExportTarget,
  ExportTargetConditions,
  ResolvedExportsOptions,
} from './syncExports.js';
export {
  diffExports,
  entryRecordToExports,
  exportsAreSynced,
  mergeExports,
  resolveExportsOptions,
} from './syncExports.js';
export type { WorkspacePackage } from './workspaces.js';
export { findWorkspacePackages, findWorkspaceRoot } from './workspaces.js';
