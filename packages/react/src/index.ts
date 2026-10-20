// packages/react/src/index.ts

export { Grid, Grid as GpGrid } from "./Grid";
export { useGridData } from "./useGridData";
export type { UseGridDataOptions, UseGridDataResult } from "./useGridData";
export { useRowGroupingSync, useRowGroupCellContext } from "./hooks/useRowGroups";
export type { RowGroupCellContext, RowGroupCellOptions } from "./hooks/useRowGroups";

export type {
  GridRef,
  GridProps,
  ReactCellRenderer,
  ReactEditRenderer,
  ReactHeaderRenderer,
  ReactGroupHeaderRenderer,
  ReactGroupLabelRenderer,
  ReactHeaderRendererRegistry,
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
  TextFilterCondition,
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

  ColumnGroupDefinition,
  ColumnGroupChild,
  ColumnGroupLimits,
  ColumnGroupHeaderParams,
  ColumnSchemaError,
  ColumnSchemaErrorCode,
  ColumnSchemaErrorSource,
  ColumnSchemaResult,
  HeaderBandLayout,
  HeaderRun,
  HeaderFragment,
  HeaderFragments,

  // Row ID
  RowId,
  ViewRow,

  // Hierarchical rows and row grouping
  HierarchyRecordRow,
  HierarchyGroupRow,
  HierarchyTotalRow,
  HierarchyRow,
  HierarchyRowKind,
  HierarchyRecordChange,
  HierarchicalRowAccess,
  RowGroupResult,
  RowGrouping,
  RowGroupingConfig,
  RowGroupDimension,
  RowGroupMeasure,
  RowGroupAggregator,
  RowGroupBuiltInAggregate,
  RowGroupingState,
  RowGroupingRejection,
  RowGroupingResult,
  RowGroupToggledEvent,
  HierarchyChange,
  // Server grouping (PRD 009)
  GroupPathStep,
  ServerGroupingSpec,
  ServerGroupChildrenRequest,
  ServerGroupNode,
  ServerGroupChildrenResponse,
  ServerLeavesRequest,
  ServerLeavesResponse,
  ServerGroupingService,
  ServerGroupingConfig,
  ServerGroupingSource,
  // Pivot (PRD 012)
  PivotMeasure,
  PivotSchema,
  PivotSchemaOptions,
  PivotConfig,
  PivotSource,
  GridRowGroupsApi,
  GroupLabelRendererParams,

  // Cell position & range
  CellPosition,
  CellRange,

  // Events
  CellValueChangedEvent,
  CellWriteRejectedEvent,
  WriteRejectionOperation,
  WriteCommittedEvent,
  WriteChange,
  WriteOperation,
  ColumnResizedEvent,
  ColumnMovedEvent,
  ColumnPinnedEvent,
  RowDragEndEvent,
  RowResizedEvent,

  // Row resize and one-shot fit
  AutoFitOptions,
  FitStatus,
  FitClamp,
  RowFitResult,
  RowFitEntry,
  RowFitSkip,
  ColumnFitResult,
  ColumnFitEntry,
  ColumnFitSkip,

  // DataSource
  DataSource,
  DataSourceRequest,
  DataSourceResponse,
  DataSourceRange,
  DataSourceLoadMode,
  FreezeRowsOptions,
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

  // Live region
  GridAnnouncement,

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
  // GridCore namespaces
  GridRowsApi,
  GridCellsApi,
  GridEditApi,
  GridColumnsApi,
  GridFrozenRowsApi,
  GridHeaderApi,
  GridRowDragApi,
  GridRowHeightsApi,
  GridViewportApi,
  // Row virtualization and freezing
  RowRegion,
  RowHeightUpdate,
  FrozenRowsState,
  RowRegionLayout,
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
  createRowGrouping,
  createServerGroupingSource,
  createPivotSource,
  encodeGroupId,
  decodeGroupId,
  buildPivotSchema,
  encodePivotColumnId,
  decodePivotColumnId,
  encodePivotGroupId,
  PIVOT_LABEL_COLUMN_ID,
  isHierarchicalRowAccess,
} from "@gp-grid/core";

// Re-export MutableDataSource type
export type { MutableDataSource } from "@gp-grid/core";

// Re-export GridCore class for typing (used with GridRef)
export { GridCore } from "@gp-grid/core";
