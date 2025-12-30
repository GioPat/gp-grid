// packages/core/src/types/columns.ts
// Column definition types

import type { CellDataType } from "./basic";

/** Column definition */
export interface ColumnDefinition {
  field: string;
  colId?: string;
  cellDataType: CellDataType;
  width: number;
  headerName?: string;
  editable?: boolean;
  /** Whether column is sortable. Default: true when sortingEnabled */
  sortable?: boolean;
  /** Whether column is filterable. Default: true */
  filterable?: boolean;
  /** Renderer key for adapter lookup, or inline renderer function */
  cellRenderer?: string;
  editRenderer?: string;
  headerRenderer?: string;
}
