// packages/core/src/types/index.ts
// Re-export all types from domain modules

// Basic types
export type {
  CellDataType,
  CellValue,
  Row,
  RowId,
  SortDirection,
  SortModel,
  CellPosition,
  CellRange,
  SelectionState,
  EditState,
  FillHandleState,
  SlotState,
} from "./basic";

// Highlighting types (must come before columns, which depends on these)
export type {
  HoverScope,
  HighlightColumnInfo,
  HighlightContext,
  HighlightingOptions,
} from "./highlighting";

// Column types
export type { ColumnDefinition } from "./columns";

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
  ColumnFilterModel,
  FilterModel,
} from "./filters";

// Data source types
export type {
  DataSourceRequest,
  DataSourceResponse,
  DataSource,
} from "./data-source";

// Instruction types
export type {
  CreateSlotInstruction,
  DestroySlotInstruction,
  AssignSlotInstruction,
  MoveSlotInstruction,
  SetActiveCellInstruction,
  SetSelectionRangeInstruction,
  UpdateVisibleRangeInstruction,
  SetHoverPositionInstruction,
  StartEditInstruction,
  StopEditInstruction,
  CommitEditInstruction,
  SetContentSizeInstruction,
  UpdateHeaderInstruction,
  OpenFilterPopupInstruction,
  CloseFilterPopupInstruction,
  StartFillInstruction,
  UpdateFillInstruction,
  CommitFillInstruction,
  CancelFillInstruction,
  DataLoadingInstruction,
  DataLoadedInstruction,
  DataErrorInstruction,
  RowsAddedInstruction,
  RowsRemovedInstruction,
  RowsUpdatedInstruction,
  TransactionProcessedInstruction,
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

// Options types
export type { GridCoreOptions } from "./options";

// Input types
export type {
  PointerEventData,
  KeyEventData,
  ContainerBounds,
  InputResult,
  KeyboardResult,
  DragMoveResult,
  InputHandlerDeps,
  DragState,
} from "./input";
