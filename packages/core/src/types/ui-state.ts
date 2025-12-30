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

export interface SlotData {
  slotId: string;
  rowIndex: number;
  rowData: Row;
  translateY: number;
}

export interface HeaderData {
  column: ColumnDefinition;
  sortDirection?: SortDirection;
  sortIndex?: number;
  sortable: boolean;
  filterable: boolean;
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
// Grid State
// =============================================================================

export interface GridState {
  slots: Map<string, SlotData>;
  activeCell: CellPosition | null;
  selectionRange: CellRange | null;
  editingCell: { row: number; col: number; initialValue: CellValue } | null;
  contentWidth: number;
  contentHeight: number;
  headers: Map<number, HeaderData>;
  filterPopup: FilterPopupState | null;
  isLoading: boolean;
  error: string | null;
  totalRows: number;
  /** Visible row range (start inclusive, end inclusive). Used to prevent selection showing in overscan. */
  visibleRowRange: { start: number; end: number } | null;
}
