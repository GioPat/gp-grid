// gp-grid-core/src/index.ts

// =============================================================================
// New Architecture Exports
// =============================================================================

/** Grid Core orchestrator */
export { GridCore } from "./grid-core";

/** Selection Manager */
export { SelectionManager } from "./selection";
export { FillManager } from "./fill";

/** Data sources */
export {
  createClientDataSource,
  createServerDataSource,
  createDataSourceFromArray,
  createMutableClientDataSource,
} from "./data-source";

/** Transaction system */
export { IndexedDataStore } from "./indexed-data-store";
export { TransactionManager } from "./transaction-manager";

/** Data source types */
export type { MutableDataSource, MutableClientDataSourceOptions, DataChangeListener } from "./data-source";
export type { IndexedDataStoreOptions } from "./indexed-data-store";
export type { Transaction, TransactionResult, TransactionManagerOptions } from "./transaction-manager";

/** Web Worker utilities for sorting */
export {
  SortWorkerManager,
  getSharedSortWorker,
  terminateSharedSortWorker,
} from "./worker-manager";

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
} from "./types";

/** Direction type from selection */
export type { Direction } from "./selection";
