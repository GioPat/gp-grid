// packages/core/src/types/highlighting.ts

import type { CellPosition, CellRange } from "./basic";

/**
 * Hover scope configuration for highlighting.
 * - "none": Disable hover-based highlighting (default)
 * - "cell": Only the hovered cell is marked as hovered (isHoveredCell = true)
 * - "row": The entire row is marked as hovered (isHoveredRow = true for all cells in row)
 * - "column": The entire column is marked as hovered (isHoveredColumn = true for all cells in column)
 * - "crosshair": Both row and column are marked as hovered
 */
export type HoverScope = "none" | "cell" | "row" | "column" | "crosshair";

/**
 * Minimal column info for highlighting context.
 * Uses structural typing to avoid circular dependency with columns.ts.
 */
export interface HighlightColumnInfo {
  field: string;
  colId?: string;
}

/**
 * Unified context for row, column, and cell highlighting.
 *
 * - Row context: `rowIndex` is set, `colIndex` is null
 * - Column context: `colIndex` is set, `rowIndex` is null
 * - Cell context: both `rowIndex` and `colIndex` are set
 */
export interface HighlightContext<TData = Record<string, unknown>> {
  /** Row index. Null for column-only context. */
  rowIndex: number | null;
  /** Column index. Null for row-only context. */
  colIndex: number | null;

  /** Column definition. Present for column and cell contexts. */
  column?: HighlightColumnInfo;
  /** Row data. Present for row and cell contexts. */
  rowData?: TData;

  // Current grid state
  /** Currently hovered cell position, null if not hovering */
  hoverPosition: CellPosition | null;
  /** Currently active (focused) cell position */
  activeCell: CellPosition | null;
  /** Current selection range */
  selectionRange: CellRange | null;

  // Computed convenience flags
  /** Whether this row/column/cell is hovered (respects hoverScope) */
  isHovered: boolean;
  /** Whether this row/column contains or is the active cell */
  isActive: boolean;
  /** Whether this row/column/cell overlaps or is in the selection range */
  isSelected: boolean;
}

/**
 * Grid-level highlighting options.
 * Callbacks are only invoked on state changes and completely skipped
 * if the highlighting option is not configured.
 */
export interface HighlightingOptions<TData = Record<string, unknown>> {
  /**
   * Hover scope: which dimension(s) to highlight on hover.
   * Defaults to "none" (hover tracking disabled).
   */
  hoverScope?: HoverScope;

  /**
   * Row-level class callback.
   * Classes returned are applied to the row container element.
   * Context has `rowIndex` set, `colIndex` is null.
   * @returns Array of CSS class names
   */
  computeRowClasses?: (context: HighlightContext<TData>) => string[];

  /**
   * Column-level class callback.
   * Classes returned are applied to all cells in that column (not header).
   * Context has `colIndex` set, `rowIndex` is null.
   * @returns Array of CSS class names
   */
  computeColumnClasses?: (context: HighlightContext<TData>) => string[];

  /**
   * Cell-level class callback.
   * Classes returned are applied to individual cells for fine-grained control.
   * Context has both `rowIndex` and `colIndex` set.
   * @returns Array of CSS class names
   */
  computeCellClasses?: (context: HighlightContext<TData>) => string[];
}
