// packages/core/src/types/index.ts
// Re-export all types from domain modules

// Basic types
export type {
  CellDataType,
  CellValue,
  RowId,
  ViewRow,
  SortDirection,
  SortModel,
  CellPosition,
  CellRange,
  SelectionState,
  EditState,
  FillHandleState,
  CellValueChangedEvent,
  CellWriteRejectedEvent,
  WriteRejectionOperation,
  WriteRejectionReason,
  SlotState,
  RowHeightUpdate,
} from "./basic";

/** Object-shaped interaction events */
export type {
  ColumnResizedEvent,
  ColumnMovedEvent,
  ColumnPinnedEvent,
  RowDragEndEvent,
  RowResizedEvent,
} from "./events";

// One-shot measurement and fit results
export type {
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
} from "./measurement";

// Highlighting types (must come before columns, which depends on these)
export type {
  HighlightColumnInfo,
  HighlightContext,
  HighlightingOptions,
} from "./highlighting";

// Column types
export type {
  ColumnDefinition,
  ColumnState,
  ColumnStateUpdate,
  ColumnStateSnapshot,
  ColumnModelState,
} from "./columns";

// Nested column-group descriptors and schema results
export type {
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
} from "./column-groups";

// Filter types
export type {
  TextFilterOperator,
  NumberFilterOperator,
  DateFilterOperator,
  FilterCombination,
  TextFilterCondition,
  NumberFilterCondition,
  DateFilterCondition,
  FilterCondition,
  FilterConditionGroup,
  ColumnFilterModel,
  LegacyFilterCondition,
  LegacyColumnFilterModel,
  ColumnFilterInput,
  FilterModel,
} from "./filters";

// Data source types
export type {
  DataSourceRequest,
  DataSourceResponse,
  DataSourceRange,
  DataSourceLoadMode,
  DataSource,
  RowAccess,
} from "./data-source";

// Hierarchical rows
export type {
  HierarchyRecordRow,
  HierarchyGroupRow,
  HierarchyTotalRow,
  HierarchyRow,
  HierarchyRowKind,
  HierarchyRecordChange,
  HierarchicalRowAccess,
  FlatRowSource,
  RowGroupDimension,
  RowGroupAggregator,
  RowGroupBuiltInAggregate,
  RowGroupMeasure,
  RowGroupingConfig,
  RowGroupResult,
  RowGrouping,
  RowGroupingHost,
  RowGroupingState,
  RowGroupingRejection,
  RowGroupingResult,
  RowGroupToggledEvent,
} from "./row-groups";
export { isHierarchicalRowAccess } from "./row-groups";

// Columnar source types
export type {
  ColumnarField,
  ColumnarDataSourceOptions,
  ColumnarAccess,
  ColumnarDataSource,
} from "./columnar";
export { isColumnarDataSource } from "./columnar";

// Instruction types
export type {
  CreateSlotInstruction,
  DestroySlotInstruction,
  AssignSlotInstruction,
  MoveSlotInstruction,
  ScrollToInstruction,
  SetActiveCellInstruction,
  SetSelectionRangeInstruction,
  UpdateVisibleRangeInstruction,
  SetHoverPositionInstruction,
  StartEditInstruction,
  StopEditInstruction,
  CommitEditInstruction,
  StartPeekInstruction,
  StopPeekInstruction,
  SetContentSizeInstruction,
  UpdateHeaderInstruction,
  RemoveHeadersInstruction,
  OpenFilterPopupInstruction,
  CloseFilterPopupInstruction,
  StartFillInstruction,
  UpdateFillInstruction,
  CommitFillInstruction,
  CancelFillInstruction,
  DataLoadingInstruction,
  DataLoadedInstruction,
  DataErrorInstruction,
  ColumnsChangedInstruction,
  SetColumnWindowInstruction,
  SetRowRegionsInstruction,
  SetHeaderBandsInstruction,
  SetAnnouncementInstruction,
  GridInstruction,
  InstructionListener,
  BatchInstructionListener,
} from "./instructions";

// Renderer types
export type {
  CellRendererParams,
  GroupLabelRendererParams,
  EditRendererParams,
  HeaderRendererParams,
  ColumnGroupHeaderParams,
} from "./renderers";

// Geometry types
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
} from "./geometry";

// Options types
export type {
  GridCoreOptions,
  AutoFitOptions,
  FreezeRowsOptions,
  RowLoadingOptions,
  RowLoadingMode,
  RowCacheOptions,
  RowCacheEviction,
} from "./options";

// Input types
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
} from "./input";
