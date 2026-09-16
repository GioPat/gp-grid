// packages/core/src/data-source/index.ts

// Client data source
export {
  createClientDataSource,
  createDataSourceFromArray,
} from "./client-data-source";

// Read-only columnar data source
export { createColumnarDataSource } from "./columnar-data-source";

// Server data source
export {
  createServerDataSource,
  type ServerDataSourceOptions,
} from "./server-data-source";

// Mutable data source
export {
  createMutableClientDataSource,
  type MutableDataSource,
  type MutableClientDataSourceOptions,
  type DataChangeListener,
} from "./mutable-data-source";
