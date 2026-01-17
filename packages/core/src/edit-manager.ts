// packages/core/src/edit-manager.ts

import type { EditState, CellValue, ColumnDefinition } from "./types";
import { createInstructionEmitter } from "./utils";

// =============================================================================
// Types
// =============================================================================

export interface EditManagerOptions {
  /** Get column definition by index */
  getColumn: (colIndex: number) => ColumnDefinition | undefined;
  /** Get cell value */
  getCellValue: (row: number, col: number) => CellValue;
  /** Set cell value */
  setCellValue: (row: number, col: number, value: CellValue) => void;
  /** Callback when edit is committed (to update slot display) */
  onCommit?: (row: number, col: number, value: CellValue) => void;
}

// =============================================================================
// EditManager
// =============================================================================

/**
 * Manages cell editing state and operations.
 */
export class EditManager {
  private editState: EditState | null = null;
  private options: EditManagerOptions;
  private emitter = createInstructionEmitter();

  // Public API delegates to emitter
  onInstruction = this.emitter.onInstruction;
  private emit = this.emitter.emit;

  constructor(options: EditManagerOptions) {
    this.options = options;
  }

  // ===========================================================================
  // State Accessors
  // ===========================================================================

  /**
   * Get the current edit state.
   */
  getState(): EditState | null {
    return this.editState ? { ...this.editState } : null;
  }

  /**
   * Check if currently editing.
   */
  isEditing(): boolean {
    return this.editState !== null;
  }

  /**
   * Check if a specific cell is being edited.
   */
  isEditingCell(row: number, col: number): boolean {
    return (
      this.editState !== null &&
      this.editState.row === row &&
      this.editState.col === col
    );
  }

  // ===========================================================================
  // Edit Operations
  // ===========================================================================

  /**
   * Start editing a cell.
   * Returns true if edit was started, false if cell is not editable.
   */
  startEdit(row: number, col: number): boolean {
    const column = this.options.getColumn(col);
    if (!column || column.editable !== true) {
      return false;
    }

    const initialValue = this.options.getCellValue(row, col);
    this.editState = {
      row,
      col,
      initialValue,
      currentValue: initialValue,
    };

    this.emit({
      type: "START_EDIT",
      row,
      col,
      initialValue,
    });

    return true;
  }

  /**
   * Update the current edit value.
   */
  updateValue(value: CellValue): void {
    if (this.editState) {
      this.editState.currentValue = value;
    }
  }

  /**
   * Commit the current edit.
   * Saves the value and closes the editor.
   */
  commit(): void {
    if (!this.editState) return;

    const { row, col, currentValue } = this.editState;

    // Update the cell value
    this.options.setCellValue(row, col, currentValue);

    // Emit commit instruction
    this.emit({
      type: "COMMIT_EDIT",
      row,
      col,
      value: currentValue,
    });

    // Clear edit state
    this.editState = null;
    this.emit({ type: "STOP_EDIT" });

    // Notify that edit was committed (for slot update)
    this.options.onCommit?.(row, col, currentValue);
  }

  /**
   * Cancel the current edit.
   * Discards changes and closes the editor.
   */
  cancel(): void {
    this.editState = null;
    this.emit({ type: "STOP_EDIT" });
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Clean up resources for garbage collection.
   */
  destroy(): void {
    this.emitter.clearListeners();
    this.editState = null;
  }
}
