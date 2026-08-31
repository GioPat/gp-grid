// @gp-grid/core/src/index.ts

// =============================================================================
// New Architecture Exports
// =============================================================================

/** Grid Core orchestrator */
export { GridCore } from "./grid-core";

/** Input handler (wired by the framework wrappers) */
export { InputHandler } from "./input-handler";
export { TransactionManager } from "./managers";

/** Data sources */
export {
  createClientDataSource,
  createServerDataSource,
  createDataSourceFromArray,
  createMutableClientDataSource,
} from "./data-source";

/** Transaction system */
export { IndexedDataStore } from "./indexed-data-store/index";

/** Data source types */
export type {
  MutableDataSource,
  MutableClientDataSourceOptions,
  DataChangeListener,
  ServerDataSourceOptions,
} from "./data-source";
export type { IndexedDataStoreOptions } from "./indexed-data-store/index";

/** Filtering utilities (from indexed-data-store) */
export {
  evaluateTextCondition,
  evaluateNumberCondition,
  evaluateDateCondition,
  evaluateColumnFilter,
  rowPassesFilter,
  isSameDay,
} from "./indexed-data-store/index";
export {
  isLegacyColumnFilterModel,
  normalizeColumnFilterModel,
} from "./filtering/normalize";

/** Values-mode filter popup helpers (raw values grouped under display labels) */
export {
  rawValueKey,
  groupDistinctValues,
  labelsForSelectedValues,
  rawValuesForLabels,
  isBlankCellValue,
} from "./filtering/distinct-entries";
export type { DistinctValueEntry } from "./filtering/distinct-entries";

/** Field helpers (from indexed-data-store) */
export { getFieldValue, setFieldValue } from "./indexed-data-store/index";
export type {
  Transaction,
  TransactionResult,
  TransactionManagerOptions,
} from "./managers";

/** Parallel (worker) sorting configuration accepted by the data sources */
export type { ParallelSortOptions } from "./sorting";

/** Types */
export type {
  CellDataType,
  CellValue,
  RowId,
  SortDirection,
  SortModel,

  /** Filter types */
  FilterModel,
  ColumnFilterModel,
  LegacyColumnFilterModel,
  ColumnFilterInput,
  FilterCondition,
  LegacyFilterCondition,
  FilterConditionGroup,
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
  DataSourceRange,
  DataSourceLoadMode,

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
  StartPeekInstruction,
  StopPeekInstruction,
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
  ColumnsChangedInstruction,

  /** Options */
  GridCoreOptions,
  RowLoadingOptions,
  RowLoadingMode,
  RowCacheOptions,
  RowCacheEviction,

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
  ColumnResizeDragState,
  ColumnMoveDragState,
  RowDragState,
} from "./types/input";

// =============================================================================
// Shared UI Utilities (for framework wrappers)
// =============================================================================

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
} from "./utils/classNames";

/** UI State types (shared between framework wrappers) */
export type {
  SlotData,
  HeaderData,
  FilterPopupState,
  GridState,
  InitialStateArgs,
} from "./types/ui-state";

export { createInitialState } from "./types/ui-state";

/** State reducer (shared instruction handler for framework wrappers) */
export { applyInstruction } from "./state-reducer";

/** Scroll helpers */
export { scrollCellIntoView } from "./utils/scroll-helpers";
export type { ColumnScrollGeometry } from "./utils/scroll-helpers";

/** Format helpers */
export { formatCellValue } from "./utils/format-helpers";

/** Fill handle helpers */
export { calculateFillHandlePosition } from "./utils/fill-helpers";
export type {
  VisibleColumnInfo,
  CalculateFillHandlePositionParams,
  FillHandlePosition,
} from "./utils/fill-helpers";

/** Popup positioning helpers */
export { calculateFilterPopupPosition } from "./utils/popup-position";
export type { PopupPosition } from "./utils/popup-position";

/** Peek overlay Ctrl/Cmd+A scoping helper. */
export { bindPeekSelectAll } from "./utils/peek-select-all";

/** Localization: shared label model and helpers */
export {
  defaultGridLabels,
  resolveGridLabels,
  formatLabel,
  getTextOperatorOptions,
  getNumberOperatorOptions,
  getDateOperatorOptions,
} from "./i18n";
export type {
  GridLabels,
  GridLabelOverrides,
  GridFilterOperatorLabels,
  FilterOperatorOption,
} from "./i18n";

/**
 * Framework-adapter kit. Reactivity-agnostic primitives shared by the
 * react/vue/angular wrappers so pointer-event serialization, batch state
 * fan-out, the auto-scroll loop, and the pending row-drag FSM live in one
 * place instead of being duplicated per framework.
 */
export {
  toPointerEventData,
  AutoScrollDriver,
  PendingRowDragController,
  PendingCellTapController,
  TouchScrollController,
  applyBatchInstructions,
  DataSourceOwner,
  InputEventAdapter,
} from "./adapter";
export type {
  PendingRowDragDeps,
  PendingCellTapDeps,
  TouchScrollDeps,
  BatchChangeSetters,
  InputEventAdapterDeps,
  CellPointerAction,
  FillPointerAction,
  DragEndResult,
} from "./adapter";

/** Shared pointer-interaction thresholds */
export { TAP_SLOP_PX, ROW_DRAG_HOLD_MS } from "./input";
