// packages/vue/src/index.ts

// =============================================================================
// Main Component
// =============================================================================

export { GpGrid, default } from "./GpGrid";

// =============================================================================
// Composables
// =============================================================================

export { useGpGrid } from "./composables/useGpGrid";
export type { UseGpGridOptions, UseGpGridResult } from "./composables/useGpGrid";

export { useInputHandler } from "./composables/useInputHandler";
export type { UseInputHandlerOptions, UseInputHandlerResult } from "./composables/useInputHandler";

export { useAutoScroll } from "./composables/useAutoScroll";

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
  // Styles
  injectStyles,
  gridStyles,
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
} from "gp-grid-core";

export type {
  // Basic types
  CellDataType,
  CellValue,
  Row,
  RowId,
  SortDirection,
  SortModel,
  // Column definition
  ColumnDefinition,
  // Cell coordinates
  CellPosition,
  CellRange,
  // Selection
  SelectionState,
  // Data source
  DataSource,
  DataSourceRequest,
  DataSourceResponse,
  MutableDataSource,
  // Filters
  FilterModel,
  ColumnFilterModel,
  FilterCondition,
  TextFilterCondition,
  NumberFilterCondition,
  DateFilterCondition,
  // Instructions
  GridInstruction,
  // Renderer params
  CellRendererParams,
  EditRendererParams,
  HeaderRendererParams,
  // UI State (shared with React)
  SlotData,
  HeaderData,
  FilterPopupState,
  GridState,
  // Input handler types
  PointerEventData,
  KeyEventData,
  ContainerBounds,
  DragState,
} from "gp-grid-core";
