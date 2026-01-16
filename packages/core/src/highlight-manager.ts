// packages/core/src/highlight-manager.ts

import type {
  CellPosition,
  CellRange,
  ColumnDefinition,
  GridInstruction,
  InstructionListener,
  HighlightingOptions,
  HoverScope,
  HighlightContext,
} from "./types";
import {
  isRowInHoverScope,
  isColumnInHoverScope,
  isRowInSelectionRange,
  isColumnInSelectionRange,
} from "./utils/classNames";

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
  private listeners: InstructionListener[] = [];

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
  // Instruction Emission
  // ===========================================================================

  onInstruction(listener: InstructionListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(instruction: GridInstruction): void {
    for (const listener of this.listeners) {
      listener(instruction);
    }
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  getHoverScope(): HoverScope {
    return this.highlightingOptions.hoverScope ?? "none";
  }

  /**
   * Check if hover tracking is enabled (hoverScope !== "none")
   */
  isHoverTrackingEnabled(): boolean {
    return this.getHoverScope() !== "none";
  }

  /**
   * Check if highlighting is enabled (any callback defined)
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
   */
  setHoverPosition(position: CellPosition | null): void {
    // Skip if hover tracking is disabled
    if (!this.isHoverTrackingEnabled()) return;

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
   */
  buildRowContext(
    rowIndex: number,
    rowData?: TData,
  ): HighlightContext<TData> {
    const activeCell = this.options.getActiveCell();
    const selectionRange = this.options.getSelectionRange();
    const scope = this.getHoverScope();

    return {
      rowIndex,
      colIndex: null,
      column: undefined,
      rowData,
      hoverPosition: this.hoverPosition,
      activeCell,
      selectionRange,
      isHovered: isRowInHoverScope(rowIndex, this.hoverPosition, scope),
      isActive: activeCell?.row === rowIndex,
      isSelected: isRowInSelectionRange(rowIndex, selectionRange),
    };
  }

  /**
   * Build context for column highlighting callback.
   * Returns context with `colIndex` set, `rowIndex` is null.
   */
  buildColumnContext(
    colIndex: number,
    column: ColumnDefinition,
  ): HighlightContext<TData> {
    const activeCell = this.options.getActiveCell();
    const selectionRange = this.options.getSelectionRange();
    const scope = this.getHoverScope();

    return {
      rowIndex: null,
      colIndex,
      column,
      rowData: undefined,
      hoverPosition: this.hoverPosition,
      activeCell,
      selectionRange,
      isHovered: isColumnInHoverScope(colIndex, this.hoverPosition, scope),
      isActive: activeCell?.col === colIndex,
      isSelected: isColumnInSelectionRange(colIndex, selectionRange),
    };
  }

  /**
   * Build context for cell highlighting callback.
   * Returns context with both `rowIndex` and `colIndex` set.
   */
  buildCellContext(
    rowIndex: number,
    colIndex: number,
    column: ColumnDefinition,
    rowData?: TData,
  ): HighlightContext<TData> {
    const activeCell = this.options.getActiveCell();
    const selectionRange = this.options.getSelectionRange();
    const scope = this.getHoverScope();

    // Compute isHovered based on scope
    const isHovered = this.computeCellHovered(rowIndex, colIndex, scope);

    // Check if cell is in selection
    let isSelected = false;
    if (selectionRange) {
      const minRow = Math.min(selectionRange.startRow, selectionRange.endRow);
      const maxRow = Math.max(selectionRange.startRow, selectionRange.endRow);
      const minCol = Math.min(selectionRange.startCol, selectionRange.endCol);
      const maxCol = Math.max(selectionRange.startCol, selectionRange.endCol);
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

  /**
   * Compute whether a cell is hovered based on scope.
   * For "cell" scope, only the exact cell is hovered.
   * For "row"/"column"/"crosshair", the entire row/column/both are hovered.
   */
  private computeCellHovered(
    rowIndex: number,
    colIndex: number,
    scope: HoverScope,
  ): boolean {
    if (!this.hoverPosition || scope === "none") return false;

    const isExactCell =
      this.hoverPosition.row === rowIndex &&
      this.hoverPosition.col === colIndex;

    switch (scope) {
      case "cell":
        return isExactCell;
      case "row":
        return this.hoverPosition.row === rowIndex;
      case "column":
        return this.hoverPosition.col === colIndex;
      case "crosshair":
        return (
          this.hoverPosition.row === rowIndex ||
          this.hoverPosition.col === colIndex
        );
      default:
        return false;
    }
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
    this.listeners = [];
    this.clearAllCaches();
    this.hoverPosition = null;
  }
}
