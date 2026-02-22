// packages/core/src/row-mutation-manager.ts

import type { Row } from "./../types";
import { createInstructionEmitter } from "./../utils";

// =============================================================================
// Types
// =============================================================================

export interface RowMutationManagerOptions<TData> {
  /** Get the cached rows map */
  getCachedRows: () => Map<number, TData>;
  /** Set the cached rows map (for bulk operations) */
  setCachedRows: (rows: Map<number, TData>) => void;
  /** Get total row count */
  getTotalRows: () => number;
  /** Set total row count */
  setTotalRows: (count: number) => void;
  /** Update a single slot after row change */
  updateSlot: (rowIndex: number) => void;
  /** Refresh all slots after bulk changes */
  refreshAllSlots: () => void;
  /** Emit content size change */
  emitContentSize: () => void;
  /** Clear selection if it references invalid rows */
  clearSelectionIfInvalid: (maxValidRow: number) => void;
}

// =============================================================================
// RowMutationManager
// =============================================================================

/**
 * Manages row CRUD operations and cache management.
 */
export class RowMutationManager<TData extends Row = Row> {
  private options: RowMutationManagerOptions<TData>;
  private emitter = createInstructionEmitter();

  // Public API delegates to emitter
  onInstruction = this.emitter.onInstruction;
  private emit = this.emitter.emit;

  constructor(options: RowMutationManagerOptions<TData>) {
    this.options = options;
  }

  // ===========================================================================
  // Read Operations
  // ===========================================================================

  /**
   * Get a row by index.
   */
  getRow(index: number): TData | undefined {
    return this.options.getCachedRows().get(index);
  }

  // ===========================================================================
  // Write Operations
  // ===========================================================================

  /**
   * Add rows to the grid at the specified index.
   * If no index is provided, rows are added at the end.
   */
  addRows(rows: TData[], index?: number): void {
    if (rows.length === 0) return;

    const cachedRows = this.options.getCachedRows();
    const totalRows = this.options.getTotalRows();
    const insertIndex = index ?? totalRows;
    const newTotalRows = totalRows + rows.length;

    // Shift existing rows if inserting in the middle
    if (insertIndex < totalRows) {
      const newCache = new Map<number, TData>();
      for (const [rowIndex, rowData] of cachedRows) {
        if (rowIndex >= insertIndex) {
          newCache.set(rowIndex + rows.length, rowData);
        } else {
          newCache.set(rowIndex, rowData);
        }
      }
      this.options.setCachedRows(newCache);
    }

    // Insert new rows
    const currentCache = this.options.getCachedRows();
    rows.forEach((row, i) => {
      currentCache.set(insertIndex + i, row);
    });

    this.options.setTotalRows(newTotalRows);

    // Emit instruction and update UI
    const addedIndices = rows.map((_, i) => insertIndex + i);
    this.emit({
      type: "ROWS_ADDED",
      indices: addedIndices,
      count: addedIndices.length,
      totalRows: newTotalRows,
    });

    this.options.emitContentSize();
    this.options.refreshAllSlots();
  }

  /**
   * Update existing rows with partial data.
   */
  updateRows(updates: Array<{ index: number; data: Partial<TData> }>): void {
    if (updates.length === 0) return;

    const cachedRows = this.options.getCachedRows();
    const updatedIndices: number[] = [];

    for (const update of updates) {
      const existing = cachedRows.get(update.index);
      if (existing) {
        // Merge the update into existing row
        cachedRows.set(update.index, { ...existing, ...update.data });
        updatedIndices.push(update.index);
      }
    }

    if (updatedIndices.length === 0) return;

    // Emit instruction
    this.emit({
      type: "ROWS_UPDATED",
      indices: updatedIndices,
    });

    // Refresh only the affected slots
    for (const index of updatedIndices) {
      this.options.updateSlot(index);
    }
  }

  /**
   * Delete rows at the specified indices.
   */
  deleteRows(indices: number[]): void {
    if (indices.length === 0) return;

    const cachedRows = this.options.getCachedRows();
    let totalRows = this.options.getTotalRows();

    // Sort indices in descending order to handle shifts correctly
    const sortedIndices = [...indices].sort((a, b) => b - a);

    for (const index of sortedIndices) {
      if (index < 0 || index >= totalRows) continue;

      // Remove the row and shift subsequent rows
      cachedRows.delete(index);

      // Shift all rows after the deleted one
      const newCache = new Map<number, TData>();
      for (const [rowIndex, rowData] of cachedRows) {
        if (rowIndex > index) {
          newCache.set(rowIndex - 1, rowData);
        } else {
          newCache.set(rowIndex, rowData);
        }
      }
      this.options.setCachedRows(newCache);
      totalRows--;
    }

    this.options.setTotalRows(totalRows);

    // Clear selection if it references deleted rows
    this.options.clearSelectionIfInvalid(totalRows);

    // Emit instruction and update UI
    this.emit({
      type: "ROWS_REMOVED",
      indices: sortedIndices,
      totalRows,
    });

    this.options.emitContentSize();
    this.options.refreshAllSlots();
  }

  /**
   * Set a complete row at the specified index.
   * Use this for complete row replacement. For partial updates, use updateRows.
   */
  setRow(index: number, data: TData): void {
    const totalRows = this.options.getTotalRows();
    if (index < 0 || index >= totalRows) return;

    const cachedRows = this.options.getCachedRows();
    cachedRows.set(index, data);

    this.emit({
      type: "ROWS_UPDATED",
      indices: [index],
    });

    this.options.updateSlot(index);
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  destroy(): void {
    this.emitter.clearListeners();
  }
}
