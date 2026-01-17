// packages/core/src/highlight-manager.ts

import type {
  CellPosition,
  CellRange,
  ColumnDefinition,
  HighlightingOptions,
  HighlightContext,
} from "./types";
import {
  createInstructionEmitter,
  normalizeRange,
  isRowInSelectionRange,
  isColumnInSelectionRange,
} from "./utils";

// =============================================================================
// Types
// =============================================================================

export interface HighlightManagerOptions {
  getActiveCell: () => CellPosition | null;
  getSelectionRange: () => CellRange | null;
  getColumn: (colIndex: number) => ColumnDefinition | undefined;
}

// =============================================================================
// HighlightManager
// =============================================================================

/**
 * Manages row/column/cell highlighting state and class computation.
 * Emits SET_HOVER_POSITION instructions when hover position changes.
 */
export class HighlightManager<TData = Record<string, unknown>> {
  private options: HighlightManagerOptions;
  private highlightingOptions: HighlightingOptions<TData>;
  private hoverPosition: CellPosition | null = null;
  private emitter = createInstructionEmitter();

  // Public API delegates to emitter
  onInstruction = this.emitter.onInstruction;
  private emit = this.emitter.emit;

  // Caches (cleared on state change: hover or selection)
  private rowClassCache: Map<number, string[]> = new Map();
  private columnClassCache: Map<number, string[]> = new Map();
  private cellClassCache: Map<string, string[]> = new Map();

  constructor(
    options: HighlightManagerOptions,
    highlightingOptions: HighlightingOptions<TData> = {},
  ) {
    this.options = options;
    this.highlightingOptions = highlightingOptions;
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  /**
   * Check if highlighting is enabled (any callback defined).
   * Hover tracking is automatically enabled when highlighting is enabled.
   */
  isEnabled(): boolean {
    return !!(
      this.highlightingOptions.computeRowClasses ||
      this.highlightingOptions.computeColumnClasses ||
      this.highlightingOptions.computeCellClasses
    );
  }

  // ===========================================================================
  // Hover State Management
  // ===========================================================================

  /**
   * Set the current hover position. Clears caches and emits instruction.
   * Hover tracking is automatically enabled when any highlighting callback is defined.
   */
  setHoverPosition(position: CellPosition | null): void {
    // Skip if highlighting is not enabled
    if (!this.isEnabled()) return;

    // Skip if position unchanged
    if (
      this.hoverPosition?.row === position?.row &&
      this.hoverPosition?.col === position?.col
    ) {
      return;
    }

    // Clear caches (hover and cell caches depend on hover position)
    this.rowClassCache.clear();
    this.columnClassCache.clear();
    this.cellClassCache.clear();

    this.hoverPosition = position;
    this.emit({ type: "SET_HOVER_POSITION", position });
  }

  /**
   * Get the current hover position
   */
  getHoverPosition(): CellPosition | null {
    return this.hoverPosition;
  }

  // ===========================================================================
  // Selection Change Notification
  // ===========================================================================

  /**
   * Called when selection changes. Clears all caches.
   */
  onSelectionChange(): void {
    this.rowClassCache.clear();
    this.columnClassCache.clear();
    this.cellClassCache.clear();
  }

  // ===========================================================================
  // Context Builders
  // ===========================================================================

  /**
   * Build context for row highlighting callback.
   * Returns context with `rowIndex` set, `colIndex` is null.
   * `isHovered` is true when the mouse is on any cell in this row.
   */
  buildRowContext(
    rowIndex: number,
    rowData?: TData,
  ): HighlightContext<TData> {
    const activeCell = this.options.getActiveCell();
    const selectionRange = this.options.getSelectionRange();

    return {
      rowIndex,
      colIndex: null,
      column: undefined,
      rowData,
      hoverPosition: this.hoverPosition,
      activeCell,
      selectionRange,
      isHovered: this.hoverPosition?.row === rowIndex,
      isActive: activeCell?.row === rowIndex,
      isSelected: isRowInSelectionRange(rowIndex, selectionRange),
    };
  }

  /**
   * Build context for column highlighting callback.
   * Returns context with `colIndex` set, `rowIndex` is null.
   * `isHovered` is true when the mouse is on any cell in this column.
   */
  buildColumnContext(
    colIndex: number,
    column: ColumnDefinition,
  ): HighlightContext<TData> {
    const activeCell = this.options.getActiveCell();
    const selectionRange = this.options.getSelectionRange();

    return {
      rowIndex: null,
      colIndex,
      column,
      rowData: undefined,
      hoverPosition: this.hoverPosition,
      activeCell,
      selectionRange,
      isHovered: this.hoverPosition?.col === colIndex,
      isActive: activeCell?.col === colIndex,
      isSelected: isColumnInSelectionRange(colIndex, selectionRange),
    };
  }

  /**
   * Build context for cell highlighting callback.
   * Returns context with both `rowIndex` and `colIndex` set.
   * `isHovered` is true only when the mouse is on this exact cell.
   */
  buildCellContext(
    rowIndex: number,
    colIndex: number,
    column: ColumnDefinition,
    rowData?: TData,
  ): HighlightContext<TData> {
    const activeCell = this.options.getActiveCell();
    const selectionRange = this.options.getSelectionRange();

    // isHovered is true only for the exact cell
    const isHovered =
      this.hoverPosition?.row === rowIndex &&
      this.hoverPosition?.col === colIndex;

    // Check if cell is in selection
    let isSelected = false;
    if (selectionRange) {
      const { minRow, maxRow, minCol, maxCol } = normalizeRange(selectionRange);
      isSelected =
        rowIndex >= minRow &&
        rowIndex <= maxRow &&
        colIndex >= minCol &&
        colIndex <= maxCol;
    }

    return {
      rowIndex,
      colIndex,
      column,
      rowData,
      hoverPosition: this.hoverPosition,
      activeCell,
      selectionRange,
      isHovered,
      isActive: activeCell?.row === rowIndex && activeCell?.col === colIndex,
      isSelected,
    };
  }

  // ===========================================================================
  // Class Computation
  // ===========================================================================

  /**
   * Compute row classes using cache and user callback
   */
  computeRowClasses(rowIndex: number, rowData?: TData): string[] {
    const callback = this.highlightingOptions.computeRowClasses;
    if (!callback) return [];

    const cached = this.rowClassCache.get(rowIndex);
    if (cached !== undefined) return cached;

    const context = this.buildRowContext(rowIndex, rowData);
    const result = callback(context);
    this.rowClassCache.set(rowIndex, result);
    return result;
  }

  /**
   * Compute column classes using cache and user callback (or per-column override)
   */
  computeColumnClasses(
    colIndex: number,
    column: ColumnDefinition,
  ): string[] {
    const cached = this.columnClassCache.get(colIndex);
    if (cached !== undefined) return cached;

    const context = this.buildColumnContext(colIndex, column);

    // Per-column override takes precedence, then grid-level callback
    let result: string[];
    if (column.computeColumnClasses) {
      // Cast needed: column callbacks use HighlightContext without generic
      result = column.computeColumnClasses(context as HighlightContext);
    } else if (this.highlightingOptions.computeColumnClasses) {
      result = this.highlightingOptions.computeColumnClasses(context);
    } else {
      return [];
    }

    this.columnClassCache.set(colIndex, result);
    return result;
  }

  /**
   * Compute cell classes using cache and user callback (or per-column override)
   */
  computeCellClasses(
    rowIndex: number,
    colIndex: number,
    column: ColumnDefinition,
    rowData?: TData,
  ): string[] {
    const cacheKey = `${rowIndex},${colIndex}`;
    const cached = this.cellClassCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const context = this.buildCellContext(rowIndex, colIndex, column, rowData);

    // Per-column override takes precedence, then grid-level callback
    let result: string[];
    if (column.computeCellClasses) {
      // Cast needed: column callbacks use HighlightContext without generic
      result = column.computeCellClasses(context as HighlightContext);
    } else if (this.highlightingOptions.computeCellClasses) {
      result = this.highlightingOptions.computeCellClasses(context);
    } else {
      return [];
    }

    this.cellClassCache.set(cacheKey, result);
    return result;
  }

  /**
   * Compute combined cell classes (column + cell classes flattened)
   */
  computeCombinedCellClasses(
    rowIndex: number,
    colIndex: number,
    column: ColumnDefinition,
    rowData?: TData,
  ): string[] {
    const columnClasses = this.computeColumnClasses(colIndex, column);
    const cellClasses = this.computeCellClasses(rowIndex, colIndex, column, rowData);
    return [...columnClasses, ...cellClasses];
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    this.rowClassCache.clear();
    this.columnClassCache.clear();
    this.cellClassCache.clear();
  }

  /**
   * Destroy the manager and release resources
   */
  destroy(): void {
    this.emitter.clearListeners();
    this.clearAllCaches();
    this.hoverPosition = null;
  }
}
