// packages/core/src/types/columns.ts
// Column definition types

import type { CellDataType } from "./basic";
import type { HighlightContext } from "./highlighting";

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
  /** Whether column is hidden. Hidden columns are not rendered but still exist in the definition. Default: false */
  hidden?: boolean;
  /** Whether column is resizable by dragging the header edge. Default: true */
  resizable?: boolean;
  /** Minimum width in pixels when resizing. Default: 50 */
  minWidth?: number;
  /** Maximum width in pixels when resizing. Default: undefined (no limit) */
  maxWidth?: number;
  /** Whether column can be moved/reordered by dragging the header. Default: true */
  movable?: boolean;
  /** Whether this column acts as a drag handle for row dragging. Default: false */
  rowDrag?: boolean;
  /** Renderer key for adapter lookup, or inline renderer function */
  cellRenderer?: string;
  editRenderer?: string;
  headerRenderer?: string;

  /**
   * Per-column override for column-level highlighting.
   * If defined, overrides grid-level computeColumnClasses for this column.
   * Context has `colIndex` set, `rowIndex` is null.
   * @returns Array of CSS class names to apply to all cells in this column
   */
  computeColumnClasses?: (context: HighlightContext) => string[];

  /**
   * Per-column override for cell-level highlighting.
   * If defined, overrides grid-level computeCellClasses for cells in this column.
   * Context has both `rowIndex` and `colIndex` set.
   * @returns Array of CSS class names to apply to individual cells
   */
  computeCellClasses?: (context: HighlightContext) => string[];
}
