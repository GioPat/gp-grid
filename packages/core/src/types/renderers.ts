// packages/core/src/types/renderers.ts
// Renderer parameter types

import type { CellValue, SortDirection } from "./basic";
import type { ColumnDefinition } from "./columns";

/**
 * Cell renderer params.
 *
 * `value` is the value the renderer should display. If the column declares a
 * `valueFormatter`, `value` is its output (a string); otherwise it's the raw
 * cell value. Read the raw value from `rowData[column.field]` if the renderer
 * needs it independently.
 */
export interface CellRendererParams<TData = unknown> {
  /** Post-formatter display value, or raw CellValue when no formatter is set */
  value: CellValue;
  /** Row data */
  rowData: TData;
  /** Column definition */
  column: ColumnDefinition;
  /** Row index */
  rowIndex: number;
  /** Column index */
  colIndex: number;
  /** Is active cell */
  isActive: boolean;
  /** Is selected cell */
  isSelected: boolean;
  /** Is editing cell */
  isEditing: boolean;
}

/** Edit renderer params */
export interface EditRendererParams<TData = unknown>
  extends CellRendererParams<TData> {
  /** Initial value */
  initialValue: CellValue;
  /** On value change */
  onValueChange: (newValue: CellValue) => void;
  /** On commit */
  onCommit: () => void;
  /** On cancel */
  onCancel: () => void;
}

/** Header renderer params */
export interface HeaderRendererParams {
  /** Column definition */
  column: ColumnDefinition;
  /** Column index */
  colIndex: number;
  /** Sort direction */
  sortDirection?: SortDirection;
  /** Sort index */
  sortIndex?: number;
  /** Whether column is sortable */
  sortable: boolean;
  /** Whether column is filterable */
  filterable: boolean;
  /** Whether column has an active filter */
  hasFilter: boolean;
  /** On sort */
  onSort: (direction: SortDirection | null, addToExisting: boolean) => void;
  /** On filter click */
  onFilterClick: () => void;
}
