// packages/core/src/indexed-data-store/index.ts

// Re-export main class
export { IndexedDataStore } from "./indexed-data-store";
export type { IndexedDataStoreOptions } from "./indexed-data-store";

// Re-export field helpers
export { getFieldValue, setFieldValue } from "./field-helpers";

// Re-export sorting utilities
export {
  compareValues,
  HASH_CHUNK_COUNT,
  stringToSortableHashes,
  toSortableNumber,
  applySort,
} from "./sorting";

// Re-export filtering utilities
export {
  isSameDay,
  evaluateTextCondition,
  evaluateNumberCondition,
  evaluateDateCondition,
  evaluateColumnFilter,
  rowPassesFilter,
} from "../filtering";
