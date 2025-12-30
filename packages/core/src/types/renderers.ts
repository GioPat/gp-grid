// packages/core/src/types/renderers.ts
// Renderer parameter types

import type { Row, CellValue, SortDirection } from "./basic";
import type { ColumnDefinition } from "./columns";

/** Cell renderer params */
export interface CellRendererParams {
  /** Cell value */
  value: CellValue;
  /** Row data */
  rowData: Row;
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
export interface EditRendererParams extends CellRendererParams {
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
