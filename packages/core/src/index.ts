// @gp-grid/core/src/index.ts

// =============================================================================
// New Architecture Exports
// =============================================================================

/** Grid Core orchestrator */
export { GridCore } from "./grid-core";
export type { GridRowsApi } from "./grid-core-rows";
export type { GridCellsApi } from "./grid-core-cells";
export type { GridEditApi } from "./grid-core-edit";
export type { GridColumnsApi } from "./grid-core-column-api";
export type { GridHeaderApi } from "./grid-core-header";
export type { GridFrozenRowsApi } from "./grid-core-frozen-rows";
export type { GridRowHeightsApi } from "./grid-core-row-heights";
export type { GridRowDragApi } from "./grid-core-row-drag";
export type { GridRowGroupsApi } from "./grid-core-row-groups";
export type { GridViewportApi } from "./grid-core-viewport";

/** Input handler (wired by the framework wrappers) */
export { InputHandler } from "./input-handler";
export { TransactionManager } from "./managers";
export { defaultPinIcon } from "./icons";
export type { GridIcon } from "./icons";

/** Data sources */
export {
  createClientDataSource,
  createServerDataSource,
  createDataSourceFromArray,
  createMutableClientDataSource,
  createColumnarDataSource,
} from "./data-source";
export { isColumnarDataSource, isHierarchicalRowAccess } from "./types";

/** Local row grouping engine (PRD 008) */
export { createRowGrouping } from "./row-grouping";
export type {
  ColumnarField,
  ColumnarDataSourceOptions,
  ColumnarAccess,
  ColumnarDataSource,
  RowAccess,
} from "./types";

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
  ColumnState,
  ColumnStateUpdate,
  ColumnStateSnapshot,

  /** Nested column groups, schema results and header fragments (PRD 007) */
  ColumnGroupDefinition,
  ColumnGroupChild,
  ColumnGroupLimits,
  ColumnSchemaErrorCode,
  ColumnSchemaErrorSource,
  ColumnSchemaError,
  ColumnSchemaResult,
  HeaderRun,
  HeaderFragment,
  HeaderFragments,

  /** View row identity */
  ViewRow,

  /** Hierarchical rows and row grouping (PRD 008) */
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

  /** Interaction events */
  ColumnResizedEvent,
  ColumnMovedEvent,
  ColumnPinnedEvent,
  RowDragEndEvent,
  RowResizedEvent,

  /** One-shot measurement and fit results (PRD 007) */
  MeasurementHost,
  RowMeasurement,
  ColumnMeasurement,
  FitStatus,
  FitClamp,
  RowFitEntry,
  RowFitSkip,
  RowFitResult,
  ColumnFitEntry,
  ColumnFitSkip,
  ColumnFitResult,

  /** Cell Position coordinates: row and column, zero-based indices */
  CellPosition,
  /** Cell range: start and end row and column, zero-based indices */
  CellRange,

  /** Selection state */
  SelectionState,
  EditState,
  FillHandleState,
  CellValueChangedEvent,
  CellWriteRejectedEvent,
  WriteRejectionOperation,
  WriteRejectionReason,
  SlotState,
  /** Application-set row height by identity (PRD 006) */
  RowHeightUpdate,

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
  RemoveHeadersInstruction,
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
  SetRowRegionsInstruction,
  SetHeaderBandsInstruction,
  SetAnnouncementInstruction,

  /** Options */
  GridCoreOptions,
  AutoFitOptions,
  FreezeRowsOptions,
  RowLoadingOptions,
  RowLoadingMode,
  RowCacheOptions,
  RowCacheEviction,

  // Renderer params (for adapters)
  CellRendererParams,
  GroupLabelRendererParams,
  EditRendererParams,
  HeaderRendererParams,
  ColumnGroupHeaderParams,

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

/** Geometry query surface */
export type {
  ColumnLayoutMode,
  ColumnLayoutSnapshot,
  ColumnPin,
  ColumnRegion,
  ColumnRegionLayout,
  ColumnWindowSnapshot,
  DisplayedColumn,
  ResolvedColumn,
  HeaderBandLayout,
  GeometrySpace,
  AxisBounds,
  CellBounds,
  ViewportPoint,
  GridHit,
  ScrollTarget,
  RowScrollEdges,
  ContentSize,
  GridGeometry,
  RowRegion,
  FrozenRowsState,
  RowRegionLayout,
} from "./types/geometry";

/** Input handler types */
export type {
  PointerEventData,
  KeyEventData,
  ContainerBounds,
  InputResult,
  KeyboardResult,
  DragMoveResult,
  DragState,
  ColumnResizeDragState,
  ColumnMoveDragState,
  RowDragState,
  RowResizeDragState,
  ResizeTarget,
} from "./types/input";

// =============================================================================
// Shared UI Utilities (for framework wrappers)
// =============================================================================

/** Positioning utilities (standalone known-width lists) */
export {
  calculateColumnPositions,
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
  GridAnnouncement,
  InitialStateArgs,
} from "./types/ui-state";

export { createInitialState } from "./types/ui-state";

/** State reducer (shared instruction handler for framework wrappers) */
export { applyInstruction } from "./state-reducer";

/** Scroll helpers */
export { scrollCellIntoView } from "./utils/scroll-helpers";

/** Format helpers */
export { formatCellValue } from "./utils/format-helpers";

/** Fill handle helpers */
export { calculateFillHandlePosition } from "./utils/fill-helpers";
export type {
  CalculateFillHandlePositionParams,
  FillHandlePosition,
} from "./utils/fill-helpers";

/** Popup positioning helpers */
export { calculateFilterPopupPosition } from "./utils/popup-position";
export type { PopupPosition } from "./utils/popup-position";

/** Peek overlay Ctrl/Cmd+A scoping helper. */
export { bindPeekSelectAll } from "./utils/peek-select-all";

/** Header band placement, escaped DOM ids and ARIA associations (PRD 007 D9). */
export {
  escapeDomIdPart,
  fragmentHeaderBox,
  fragmentHeaderId,
  leafHeaderBox,
  leafHeaderId,
  resolveHeaderAssociations,
} from "./header-layout";
export type {
  HeaderAssociationInput,
  HeaderAssociations,
  HeaderBox,
} from "./header-layout";

/** Group definitions by id before a core exists (PRD 007 D9). */
export { createColumnGroupLookup } from "./column-groups/group-lookup";
export type { ColumnGroupLookup } from "./column-groups/group-lookup";

/** Group label column and text (PRD 008) */
export { resolveGroupLabelColumnId, formatGroupLabel, isEmptyGroupCell } from "./row-group-layout";

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
  GridRowGroupLabels,
  GridFilterOperatorLabels,
  GridColumnSchemaErrorLabels,
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
  readIsRtl,
  toInlineX,
  toPhysicalX,
  inlineOffset,
  readContainerBounds,
  fixedLeftForInline,
  normalizeHorizontalKey,
  AutoScrollDriver,
  PendingRowDragController,
  PendingCellTapController,
  TouchScrollController,
  applyBatchInstructions,
  PendingScrollLatch,
  DataSourceOwner,
  InputEventAdapter,
  createDomMeasurementHost,
} from "./adapter";
export type {
  PendingRowDragDeps,
  PendingCellTapDeps,
  TouchScrollDeps,
  BatchChangeSetters,
  PendingScroll,
  InputEventAdapterDeps,
  CellPointerAction,
  FillPointerAction,
  DragEndResult,
} from "./adapter";

/** Shared pointer-interaction thresholds */
export { TAP_SLOP_PX, ROW_DRAG_HOLD_MS } from "./input";
