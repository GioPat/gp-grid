// packages/react/src/index.ts

export { Grid } from "./Grid";

export type {
  GridRef,
  GridProps,
  ReactCellRenderer,
  ReactEditRenderer,
  ReactHeaderRenderer,
} from "./types";

// Re-export core types for convenience
export type {
  // Basic types
  CellDataType,
  CellValue,
  Row,
  SortDirection,
  SortModel,
  FilterModel,
  FilterCondition,
  ColumnFilterModel,

  // Column definition
  ColumnDefinition,

  // Row ID
  RowId,

  // Cell position & range
  CellPosition,
  CellRange,

  // Events
  CellValueChangedEvent,

  // DataSource
  DataSource,
  DataSourceRequest,
  DataSourceResponse,

  // Renderer params
  CellRendererParams,
  EditRendererParams,
  HeaderRendererParams,

  // Instructions (for advanced use cases)
  GridInstruction,
} from "@gp-grid/core";

// Re-export data source factories
export {
  createClientDataSource,
  createServerDataSource,
  createDataSourceFromArray,
  createMutableClientDataSource,
} from "@gp-grid/core";

// Re-export MutableDataSource type
export type { MutableDataSource } from "@gp-grid/core";

// Re-export GridCore class for typing (used with GridRef)
export { GridCore } from "@gp-grid/core";
