export * from './lib/gp-grid.component';
export * from './lib/components';
export * from './lib/types';
export * from './lib/createGridData';
export * from './lib/grid-data.service';
export * from './lib/provide-grid-data';

// Re-export core types for convenience
export type {
  // Basic types
  CellDataType,
  CellValue,
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

  // Highlighting
  HighlightingOptions,
  HighlightContext,

  // Instructions (for advanced use cases)
  GridInstruction,
} from '@gp-grid/core';

// Re-export data source factories
export {
  createClientDataSource,
  createServerDataSource,
  createDataSourceFromArray,
  createMutableClientDataSource,
} from '@gp-grid/core';

export type { MutableDataSource } from '@gp-grid/core';
export { GridCore } from '@gp-grid/core';
