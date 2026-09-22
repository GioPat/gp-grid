// packages/react/src/index.ts

export { Grid, Grid as GpGrid } from "./Grid";
export { useGridData } from "./useGridData";
export type { UseGridDataOptions, UseGridDataResult } from "./useGridData";

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
  SortDirection,
  SortModel,
  FilterModel,
  FilterCondition,
  FilterConditionGroup,
  FilterCombination,
  ColumnFilterModel,
  LegacyFilterCondition,
  LegacyColumnFilterModel,
  ColumnFilterInput,

  // Column definition
  ColumnDefinition,
  ColumnState,
  ColumnStateUpdate,
  ColumnStateSnapshot,

  // Row ID
  RowId,
  ViewRow,

  // Cell position & range
  CellPosition,
  CellRange,

  // Events
  CellValueChangedEvent,
  CellWriteRejectedEvent,
  WriteRejectionOperation,
  ColumnResizedEvent,
  ColumnMovedEvent,
  ColumnPinnedEvent,
  RowDragEndEvent,

  // DataSource
  DataSource,
  DataSourceRequest,
  DataSourceResponse,
  DataSourceRange,
  DataSourceLoadMode,
  RowLoadingOptions,
  RowLoadingMode,
  RowCacheOptions,
  RowCacheEviction,

  // Columnar read-only source
  ColumnarAccess,
  ColumnarDataSource,
  ColumnarDataSourceOptions,
  ColumnarField,
  RowAccess,

  // Renderer params
  CellRendererParams,
  EditRendererParams,
  HeaderRendererParams,

  // Localization
  GridLabels,
  GridLabelOverrides,
  GridFilterOperatorLabels,
  GridIcon,

  // Instructions (for advanced use cases)
  GridInstruction,
  // Geometry
  ColumnLayoutMode,
  ColumnLayoutSnapshot,
  DisplayedColumn,
  // Column virtualization and pinning
  ColumnPin,
  ColumnRegion,
  ColumnWindowSnapshot,
  ResolvedColumn,
  FillHandlePosition,
  GeometrySpace,
  AxisBounds,
  CellBounds,
  ViewportPoint,
  GridHit,
  ScrollTarget,
  ContentSize,
  GridGeometry,
} from "@gp-grid/core";

// Re-export data source factories
export {
  createClientDataSource,
  createServerDataSource,
  createDataSourceFromArray,
  createMutableClientDataSource,
  createColumnarDataSource,
  isColumnarDataSource,
  isLegacyColumnFilterModel,
  normalizeColumnFilterModel,
} from "@gp-grid/core";

// Re-export MutableDataSource type
export type { MutableDataSource } from "@gp-grid/core";

// Re-export GridCore class for typing (used with GridRef)
export { GridCore } from "@gp-grid/core";
