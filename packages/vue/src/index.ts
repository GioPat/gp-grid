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

export { useGridData } from "./composables/useGridData";
export type {
  UseGridDataOptions,
  UseGridDataResult,
} from "./composables/useGridData";

export { useInputHandler } from "./composables/useInputHandler";
export type {
  UseInputHandlerOptions,
  UseInputHandlerResult,
} from "./composables/useInputHandler";

export { useAutoScroll } from "./composables/useAutoScroll";

export { useFillHandle } from "./composables/useFillHandle";
export type {
  UseFillHandleOptions,
  UseFillHandleResult,
} from "./composables/useFillHandle";

export { useFilterPopup } from "./composables/useFilterPopup";
export type { UseFilterPopupOptions } from "./composables/useFilterPopup";

export { useFilterConditions } from "./composables/useFilterConditions";
export type {
  LocalFilterCondition,
  LocalFilterGroup,
  UseFilterConditionsResult,
} from "./composables/useFilterConditions";

export { useGridState, createInitialState } from "./gridState";

// =============================================================================
// Renderers
// =============================================================================

export { renderCell, getCellValue } from "./renderers/cellRenderer";
export { renderEditCell } from "./renderers/editRenderer";
export { renderHeader } from "./renderers/headerRenderer";

// =============================================================================
// Types
// =============================================================================

export type {
  VueCellRenderer,
  VueEditRenderer,
  VueHeaderRenderer,
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
  // Utils
  calculateColumnPositions,
  getTotalWidth,
  findColumnAtX,
  isCellSelected,
  isCellActive,
  isRowVisible,
  isCellEditing,
  isCellInFillPreview,
  buildCellClasses,
  // GridCore class (for typing component refs)
  GridCore,
} from "@gp-grid/core";

export type {
  // Basic types
  CellDataType,
  CellValue,
  RowId,
  ViewRow,
  SortDirection,
  SortModel,
  // Cell coordinates
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
  // Column identity and state
  ColumnId,
  ColumnState,
  ColumnStateUpdate,
  ColumnStateSnapshot,
  // Selection
  SelectionState,
  // Data source
  DataSource,
  DataSourceRequest,
  DataSourceResponse,
  DataSourceRange,
  DataSourceLoadMode,
  RowLoadingOptions,
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
  // Localization
  GridLabels,
  GridLabelOverrides,
  GridFilterOperatorLabels,
  GridIcon,
  // UI State (shared with React)
  SlotData,
  HeaderData,
  FilterPopupState,
  GridState,
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
  // Input handler types
  PointerEventData,
  KeyEventData,
  ContainerBounds,
  DragState,
} from "@gp-grid/core";
