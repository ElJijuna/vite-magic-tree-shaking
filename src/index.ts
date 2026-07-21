export { generateEntries } from './generateEntries.js'
export type { EntryRecord, GenerateEntriesOptions } from './generateEntries.js'
export {
  entryRecordToExports,
  exportsAreSynced,
  diffExports,
  mergeExports,
} from './syncExports.js'
export type {
  ExportsMap,
  ExportConditions,
  ExportsDiff,
  ExportFormat,
  ExportsOptions,
  ExportsComparisonOptions,
} from './syncExports.js'
