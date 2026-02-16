// packages/core/src/types/ui-state.ts

import type {
  Row,
  ColumnDefinition,
  CellPosition,
  CellRange,
  CellValue,
  SortDirection,
  ColumnFilterModel,
} from "./index";

// =============================================================================
// Slot & Header Data Types
// =============================================================================

export interface SlotData<TData = Row> {
  slotId: string;
  rowIndex: number;
  rowData: TData;
  translateY: number;
}

export interface HeaderData {
  column: ColumnDefinition;
  sortDirection?: SortDirection;
  sortIndex?: number;
  hasFilter: boolean;
}

export interface FilterPopupState {
  isOpen: boolean;
  colIndex: number;
  column: ColumnDefinition | null;
  anchorRect: { top: number; left: number; width: number; height: number } | null;
  distinctValues: CellValue[];
  currentFilter?: ColumnFilterModel;
}

// =============================================================================
// Initial State
// =============================================================================

export interface InitialStateArgs {
  initialWidth?: number;
  initialHeight?: number;
}

export const createInitialState = <TData = Row>(args?: InitialStateArgs): GridState<TData> => ({
  slots: new Map(),
  activeCell: null,
  selectionRange: null,
  editingCell: null,
  contentWidth: 0,
  contentHeight: args?.initialHeight ?? 0,
  viewportWidth: args?.initialWidth ?? 0,
  viewportHeight: args?.initialHeight ?? 0,
  rowsWrapperOffset: 0,
  headers: new Map(),
  filterPopup: null,
  isLoading: false,
  error: null,
  totalRows: 0,
  visibleRowRange: null,
  hoverPosition: null,
  columns: null,
});

// =============================================================================
// Grid State
// =============================================================================

export interface GridState<TData = Row> {
  slots: Map<string, SlotData<TData>>;
  activeCell: CellPosition | null;
  selectionRange: CellRange | null;
  editingCell: { row: number; col: number; initialValue: CellValue } | null;
  contentWidth: number;
  contentHeight: number;
  /** Viewport width (container's visible width) for column scaling */
  viewportWidth: number;
  /** Viewport height (container's visible height) for loader positioning */
  viewportHeight: number;
  /** Y offset for rows wrapper when virtualization is active (keeps row translateY values small) */
  rowsWrapperOffset: number;
  headers: Map<number, HeaderData>;
  filterPopup: FilterPopupState | null;
  isLoading: boolean;
  error: string | null;
  totalRows: number;
  /** Visible row range (start inclusive, end inclusive). Used to prevent selection showing in overscan. */
  visibleRowRange: { start: number; end: number } | null;
  /** Currently hovered cell position (for highlighting) */
  hoverPosition: CellPosition | null;
  /** Columns updated by core (after resize/reorder). Null means use props. */
  columns: ColumnDefinition[] | null;
}
