export type { EntryRecord, GenerateEntriesOptions } from './generateEntries.js';
export { generateEntries } from './generateEntries.js';
export type {
  ExportConditions,
  ExportFormat,
  ExportsComparisonOptions,
  ExportsDiff,
  ExportsMap,
  ExportsOptions,
} from './syncExports.js';
export {
  diffExports,
  entryRecordToExports,
  exportsAreSynced,
  mergeExports,
} from './syncExports.js';
