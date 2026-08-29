// packages/core/src/data-source/index.ts

// Client data source
export {
  createClientDataSource,
  createDataSourceFromArray,
} from "./client-data-source";

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
