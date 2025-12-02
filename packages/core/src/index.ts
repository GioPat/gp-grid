// gp-grid-core/src/index.ts

// =============================================================================
// New Architecture Exports
// =============================================================================

// Core orchestrator
export { GridCore } from "./grid-core";

// Managers
export { SelectionManager } from "./selection";
export { FillManager } from "./fill";

// Data sources
export {
  createClientDataSource,
  createServerDataSource,
  createDataSourceFromArray,
} from "./data-source";

// Types
export type {
  // Basic types
  CellDataType,
  CellValue,
  Row,
  SortDirection,
  SortModel,
  FilterModel,
  
  // Column definition
  ColumnDefinition,
  
  // Cell position & range
  CellPosition,
  CellRange,
  
  // State types
  SelectionState,
  EditState,
  FillHandleState,
  SlotState,
  
  // DataSource
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
  DataLoadingInstruction,
  DataLoadedInstruction,
  DataErrorInstruction,
  
  // Options
  GridCoreOptions,
  
  // Renderer params (for adapters)
  CellRendererParams,
  EditRendererParams,
  HeaderRendererParams,
  
  // Listener types
  InstructionListener,
  BatchInstructionListener,
} from "./types";

// Direction type from selection
export type { Direction } from "./selection";
