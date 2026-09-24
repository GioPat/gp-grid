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
  SlotState,
} from "./basic";

/** Object-shaped interaction events */
export type {
  ColumnResizedEvent,
  ColumnMovedEvent,
  ColumnPinnedEvent,
  RowDragEndEvent,
} from "./events";

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
  SetAnnouncementInstruction,
  GridInstruction,
  InstructionListener,
  BatchInstructionListener,
} from "./instructions";

// Renderer types
export type {
  CellRendererParams,
  EditRendererParams,
  HeaderRendererParams,
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
} from "./input";
