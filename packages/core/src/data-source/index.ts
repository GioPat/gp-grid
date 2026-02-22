// packages/core/src/data-source/index.ts

// Client data source
export {
  createClientDataSource,
  createDataSourceFromArray,
  defaultGetFieldValue,
  type ClientDataSourceOptions,
} from "./client-data-source";

// Server data source
export {
  createServerDataSource,
  type ServerFetchFunction,
} from "./server-data-source";

// Mutable data source
export {
  createMutableClientDataSource,
  type MutableDataSource,
  type MutableClientDataSourceOptions,
  type DataChangeListener,
} from "./mutable-data-source";

// Sorting utilities
export {
  toSortableNumber,
  stringToSortableNumber,
  stringToSortableHashes,
  compareValues,
  applySort,
  HASH_CHUNK_COUNT,
} from "../indexed-data-store/sorting";

// Filtering utilities
export {
  applyFilters,
  evaluateColumnFilter,
  evaluateCondition,
  evaluateTextCondition,
  evaluateNumberCondition,
  evaluateDateCondition,
} from "../filtering";
