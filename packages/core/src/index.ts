// @gp-grid/core/src/index.ts

// =============================================================================
// New Architecture Exports
// =============================================================================

/** Grid Core orchestrator */
export { GridCore } from "./grid-core";

/** Managers */
export { SelectionManager } from "./selection";
export { FillManager } from "./fill";
export { SlotPoolManager } from "./slot-pool";
export { EditManager } from "./edit-manager";
export { InputHandler } from "./input-handler";
export { HighlightManager } from "./highlight-manager";

/** Manager types */
export type { SlotPoolManagerOptions, BatchInstructionListener as SlotPoolBatchListener } from "./slot-pool";
export type { EditManagerOptions } from "./edit-manager";

/** Data sources */
export {
  createClientDataSource,
  createServerDataSource,
  createDataSourceFromArray,
  createMutableClientDataSource,
} from "./data-source";

/** Transaction system */
export { IndexedDataStore } from "./indexed-data-store/index";
export { TransactionManager } from "./transaction-manager";

/** Data source types */
export type { MutableDataSource, MutableClientDataSourceOptions, DataChangeListener } from "./data-source";
export type { IndexedDataStoreOptions, RowSortCache } from "./indexed-data-store/index";

/** Sorting utilities (from indexed-data-store) */
export {
  stringToSortableNumber,
  compareValues,
  computeValueHash,
} from "./indexed-data-store/index";

/** Filtering utilities (from indexed-data-store) */
export {
  evaluateTextCondition,
  evaluateNumberCondition,
  evaluateDateCondition,
  evaluateColumnFilter,
  rowPassesFilter,
  isSameDay,
} from "./indexed-data-store/index";

/** Field helpers (from indexed-data-store) */
export { getFieldValue, setFieldValue } from "./indexed-data-store/index";
export type { Transaction, TransactionResult, TransactionManagerOptions } from "./transaction-manager";

/** Sorting utilities (worker pool, parallel sorting, k-way merge) */
export {
  // Parallel sort manager
  ParallelSortManager,
  // Worker pool
  WorkerPool,
  // K-way merge
  kWayMerge,
  kWayMergeMultiColumn,
  detectBoundaryCollisions,
} from "./sorting";

export type {
  ParallelSortOptions,
  WorkerPoolOptions,
  SortedChunk,
  MultiColumnSortedChunk,
} from "./sorting";

/** Types */
export type {
  CellDataType,
  CellValue,
  Row,
  RowId,
  SortDirection,
  SortModel,

  /** Filter types */
  FilterModel,
  ColumnFilterModel,
  FilterCondition,
  TextFilterCondition,
  NumberFilterCondition,
  DateFilterCondition,
  TextFilterOperator,
  NumberFilterOperator,
  DateFilterOperator,
  FilterCombination,

  /** Column definition */
  ColumnDefinition,

  /** Cell Position coordinates: row and column, zero-based indices */
  CellPosition,
  /** Cell range: start and end row and column, zero-based indices */
  CellRange,

  /** Selection state */
  SelectionState,

  EditState,
  FillHandleState,
  CellValueChangedEvent,
  SlotState,

  /** DataSource */
  DataSource,
  DataSourceRequest,
  DataSourceResponse,

  // Instructions
  GridInstruction,
  CreateSlotInstruction,
  DestroySlotInstruction,
  AssignSlotInstruction,
  MoveSlotInstruction,
  SetActiveCellInstruction,
  SetSelectionRangeInstruction,
  StartEditInstruction,
  StopEditInstruction,
  CommitEditInstruction,
  SetContentSizeInstruction,
  UpdateHeaderInstruction,
  StartFillInstruction,
  UpdateFillInstruction,
  CommitFillInstruction,
  CancelFillInstruction,
  OpenFilterPopupInstruction,
  CloseFilterPopupInstruction,
  DataLoadingInstruction,
  DataLoadedInstruction,
  DataErrorInstruction,
  RowsAddedInstruction,
  RowsRemovedInstruction,
  RowsUpdatedInstruction,
  TransactionProcessedInstruction,

  /** Options */
  GridCoreOptions,

  // Renderer params (for adapters)
  CellRendererParams,
  EditRendererParams,
  HeaderRendererParams,

  // Listener types
  InstructionListener,
  BatchInstructionListener,

  // Highlighting types
  HighlightContext,
  HighlightingOptions,
  SetHoverPositionInstruction,
} from "./types";

/** Direction type from selection */
export type { Direction } from "./selection";

/** Input handler types */
export type {
  PointerEventData,
  KeyEventData,
  ContainerBounds,
  InputResult,
  KeyboardResult,
  DragMoveResult,
  InputHandlerDeps,
  DragState,
} from "./types/input";

// =============================================================================
// Shared UI Utilities (for framework wrappers)
// =============================================================================

/** Styles */
export { injectStyles, gridStyles } from "./styles";
export {
  variablesStyles,
  containerStyles,
  headerStyles,
  cellStyles,
  statesStyles,
  scrollbarStyles,
  filtersStyles,
} from "./styles";

/** Positioning utilities */
export {
  calculateColumnPositions,
  calculateScaledColumnPositions,
  getTotalWidth,
  findColumnAtX,
} from "./utils/positioning";

/** Class name utilities */
export {
  isCellSelected,
  isCellActive,
  isRowVisible,
  isCellEditing,
  isCellInFillPreview,
  buildCellClasses,
  // Highlighting helpers
  isRowInSelectionRange,
  isColumnInSelectionRange,
} from "./utils/classNames";

/** UI State types (shared between framework wrappers) */
export type {
  SlotData,
  HeaderData,
  FilterPopupState,
  GridState,
} from "./types/ui-state";
