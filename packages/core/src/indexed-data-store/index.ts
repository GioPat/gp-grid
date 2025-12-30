// packages/core/src/indexed-data-store/index.ts

// Re-export main class
export { IndexedDataStore } from "./indexed-data-store";
export type { IndexedDataStoreOptions, RowSortCache } from "./indexed-data-store";

// Re-export field helpers
export { getFieldValue, setFieldValue } from "./field-helpers";

// Re-export sorting utilities
export {
  stringToSortableNumber,
  compareValues,
  computeValueHash,
  computeRowSortHashes,
  compareRowsByHashes,
  compareRowsDirect,
} from "./sorting";
export type { SortHashConfig } from "./sorting";

// Re-export filtering utilities
export {
  isSameDay,
  evaluateTextCondition,
  evaluateNumberCondition,
  evaluateDateCondition,
  evaluateColumnFilter,
  rowPassesFilter,
} from "./filtering";
export type { TextCondition, NumberCondition, DateCondition } from "./filtering";
