// packages/vue/src/index.ts

// =============================================================================
// Main Component
// =============================================================================

export { default as GpGrid, default } from "./GpGrid.vue";

// =============================================================================
// Composables
// =============================================================================

export { useGpGrid } from "./composables/useGpGrid";
export type {
  UseGpGridOptions,
  UseGpGridResult,
} from "./composables/useGpGrid";

export { useRowGroupCellContext, useRowGroupingSync } from "./composables/useRowGroupingSync";
export type { RowGroupCellContext } from "./composables/useRowGroupingSync";

export { useGridData } from "./composables/useGridData";
export type {
  UseGridDataOptions,
  UseGridDataResult,
} from "./composables/useGridData";

// =============================================================================
// Renderers
// =============================================================================

export { renderGroupHeader } from "./renderers/headerRenderer";
export { renderGroupLabel } from "./renderers/groupLabelRenderer";

// =============================================================================
// Types
// =============================================================================

export type {
  VueCellRenderer,
  VueEditRenderer,
  VueHeaderRenderer,
  VueFilterRenderer,
  VueGroupHeaderRenderer,
  VueGroupLabelRenderer,
  VueHeaderRendererRegistry,
  GpGridProps,
  ColumnDefinition,
} from "./types";

// =============================================================================
// Re-export from core (convenience)
// =============================================================================

export {
  // Data sources
  createClientDataSource,
  createServerDataSource,
  createDataSourceFromArray,
  createMutableClientDataSource,
  createColumnarDataSource,
  isColumnarDataSource,
  isLegacyColumnFilterModel,
  normalizeColumnFilterModel,
  // Row grouping
  createRowGrouping,
  isHierarchicalRowAccess,
  // Server grouping
  createServerGroupingSource,
  createPivotSource,
  encodeGroupId,
  decodeGroupId,
  buildPivotSchema,
  encodePivotColumnId,
  decodePivotColumnId,
  encodePivotGroupId,
  PIVOT_LABEL_COLUMN_ID,
  // GridCore class (for typing component refs)
  GridCore,
} from "@gp-grid/core";

export type {
  // Basic types
  CellDataType,
  CellValue,
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
  SortDirection,
  SortModel,
  // Cell coordinates
  CellPosition,
  CellRange,
  // Events
  CellValueChangedEvent,
  CellWriteRejectedEvent,
  WriteRejectionOperation,
  WriteCommittedEvent,
  WriteChange,
  WriteOperation,
  HistoryOptions,
  ColumnResizedEvent,
  ColumnMovedEvent,
  ColumnPinnedEvent,
  RowDragEndEvent,
  RowResizedEvent,
  // Column identity and state
  ColumnState,
  ColumnStateUpdate,
  ColumnStateSnapshot,
  // Column groups and header bands
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
  // Selection
  // Data source
  DataSource,
  DataSourceRequest,
  DataSourceResponse,
  DataSourceRange,
  DataSourceLoadMode,
  RowLoadingOptions,
  FreezeRowsOptions,
  RowLoadingMode,
  RowCacheOptions,
  RowCacheEviction,
  MutableDataSource,
  // Columnar read-only source
  ColumnarAccess,
  ColumnarDataSource,
  ColumnarDataSourceOptions,
  ColumnarField,
  RowAccess,
  // Filters
  FilterModel,
  ColumnFilterModel,
  LegacyColumnFilterModel,
  ColumnFilterInput,
  FilterCondition,
  LegacyFilterCondition,
  FilterConditionGroup,
  FilterCombination,
  TextFilterCondition,
  NumberFilterCondition,
  DateFilterCondition,
  // Instructions
  GridInstruction,
  // Renderer params
  CellRendererParams,
  EditRendererParams,
  HeaderRendererParams,
  FilterRendererParams,
  // Localization
  GridLabels,
  GridLabelOverrides,
  GridFilterOperatorLabels,
  GridIcon,
  // UI State (shared with React)
  SlotData,
  GridState,
  GridAnnouncement,
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
  // Fit and row resize
  AutoFitOptions,
  MeasurementHost,
  FitStatus,
  RowFitResult,
  ColumnFitResult,
  // Input handler types
  KeyEventData,
  ContainerBounds,
  DragState,
  ResizeTarget,
  RowResizeDragState,
} from "@gp-grid/core";
