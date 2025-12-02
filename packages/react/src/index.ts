// packages/react/src/index.ts

export {
  Grid,
  type GridProps,
  type ReactCellRenderer,
  type ReactEditRenderer,
  type ReactHeaderRenderer,
} from "./Grid";

// Re-export core types for convenience
export type {
  // Basic types
  CellDataType,
  CellValue,
  Row,
  SortDirection,
  SortModel,
  FilterModel,
  
  // Column definition
  ColumnDefinition,
  
  // Cell position & range
  CellPosition,
  CellRange,
  
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
} from "gp-grid-core";

// Re-export data source factories
export {
  createClientDataSource,
  createServerDataSource,
  createDataSourceFromArray,
} from "gp-grid-core";
