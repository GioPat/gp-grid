// packages/core/src/types/columns.ts
// Column definition types

import type { CellDataType, CellValue } from "./basic";
import type { HighlightContext } from "./highlighting";
import type {
  CellRendererParams,
  EditRendererParams,
  HeaderRendererParams,
} from "./renderers";

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
  cellRenderer?: string | ((params: CellRendererParams) => unknown);
  editRenderer?: string | ((params: EditRendererParams) => unknown);
  headerRenderer?: string | ((params: HeaderRendererParams) => unknown);
  /**
   * Converts a cell value to its display string. Used by the default cell renderer
   * when no `cellRenderer` is provided. Useful for `object`-type columns where the
   * default JSON.stringify may not be suitable (e.g., display a single field of an object).
   */
  valueFormatter?: (value: CellValue) => string;

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
