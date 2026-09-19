// packages/core/src/edit-manager.ts

import type {
  EditState,
  CellValue,
  CellPosition,
  CellWriteRejectedEvent,
  ColumnDefinition,
  RowId,
} from "./types";
import { createInstructionEmitter, createWriteRejection } from "./utils";

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
  /** False when the bound source refuses writes. */
  isWritable?: () => boolean;
  /** Called when an editable cell refuses a write because the source is read-only. */
  onWriteRejected?: (event: CellWriteRejectedEvent) => void;
  /**
   * Current slot-assignment generation for a view row, or -1 when no slot
   * serves it. Used to drop a commit that belongs to a recycled assignment.
   */
  getSlotGeneration?: (row: number) => number;
  /** Identity of the record at a view row, when the source exposes one. */
  getRowId?: (row: number) => RowId | undefined;
}

// =============================================================================
// EditManager
// =============================================================================

/**
 * Manages cell editing state and operations.
 */
export class EditManager {
  private editState: EditState | null = null;
  private editGeneration = -1;
  private editRowId: RowId | undefined;
  private nextEditId = 1;
  private peekState: CellPosition | null = null;
  private readonly options: EditManagerOptions;
  private readonly emitter = createInstructionEmitter();

  // Public API delegates to emitter
  onInstruction = this.emitter.onInstruction;
  private readonly emit = this.emitter.emit;

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
   * Returns true if edit was started, false if cell is not editable or the
   * source is read-only. A refused write on an editable column is reported.
   */
  startEdit(row: number, col: number): boolean {
    const column = this.options.getColumn(col);
    // A non-editable column is a disabled control: no attempted command.
    if (!column?.editable) {
      return false;
    }
    if (this.options.isWritable?.() === false) {
      this.options.onWriteRejected?.(
        createWriteRejection(row, col, column.field, "edit"),
      );
      return false;
    }

    // Editing and peeking are mutually exclusive — close any open peek first.
    if (this.peekState !== null) {
      this.stopPeek();
    }

    const initialValue = this.options.getCellValue(row, col);
    const editId = this.nextEditId++;
    this.editState = {
      row,
      col,
      initialValue,
      currentValue: initialValue,
      editId,
    };
    this.editGeneration = this.options.getSlotGeneration?.(row) ?? -1;
    this.editRowId = this.options.getRowId?.(row);

    this.emit({
      type: "START_EDIT",
      row,
      col,
      initialValue,
      editId,
    });

    return true;
  }

  /**
   * Follow a layout change that moved the edited column to a new index.
   * Re-emits START_EDIT with the draft so the re-anchored editor keeps it.
   */
  remapColumn(col: number): void {
    if (!this.editState || this.editState.col === col) return;
    this.editState = { ...this.editState, col };
    this.emit({
      type: "START_EDIT",
      row: this.editState.row,
      col,
      initialValue: this.editState.currentValue,
      editId: this.editState.editId,
    });
  }

  // ===========================================================================
  // Peek (read-only multi-line overlay)
  // ===========================================================================

  /**
   * Get the cell currently shown in a peek overlay, or null.
   */
  getPeekState(): CellPosition | null {
    return this.peekState ? { ...this.peekState } : null;
  }

  /**
   * Open a peek overlay on a cell. Caller is responsible for guarding on
   * `column.peekable` — the manager only refuses when an edit is in progress
   * (edit and peek are mutually exclusive).
   * Returns true if the peek was opened.
   */
  startPeek(row: number, col: number): boolean {
    if (this.editState !== null) return false;

    this.peekState = { row, col };
    this.emit({ type: "START_PEEK", row, col });
    return true;
  }

  /** Follow a layout change that moved the peeked column to a new index. */
  remapPeekColumn(col: number): void {
    if (this.peekState === null || this.peekState.col === col) return;
    this.peekState = { ...this.peekState, col };
    this.emit({ type: "START_PEEK", row: this.peekState.row, col });
  }

  /**
   * Close any active peek overlay. No-op if none is open.
   */
  stopPeek(): void {
    if (this.peekState === null) return;
    this.peekState = null;
    this.emit({ type: "STOP_PEEK" });
  }

  /**
   * Update the current edit value.
   */
  updateValue(value: CellValue, editId?: number): void {
    if (this.editState === null || this.isStaleSession(editId)) return;
    this.editState.currentValue = value;
  }

  /** An editor callback tagged with another session's token is stale. */
  private isStaleSession(editId: number | undefined): boolean {
    return editId !== undefined && editId !== this.editState?.editId;
  }

  /**
   * Commit the current edit.
   * Saves the value and closes the editor.
   */
  commit(editId?: number): void {
    if (!this.editState || this.isStaleSession(editId)) return;

    const { row, col, currentValue } = this.editState;

    if (this.isEditAssignmentCurrent(row) === false) {
      this.cancel();
      return;
    }

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
    this.editGeneration = -1;
    this.editRowId = undefined;
    this.emit({ type: "STOP_EDIT" });

    // Notify that edit was committed (for slot update)
    this.options.onCommit?.(row, col, currentValue);
  }

  /**
   * A refresh bumps the generation in place, so the edit is only superseded
   * when the row lost its slot or the record under that view row changed.
   */
  private isEditAssignmentCurrent(row: number): boolean {
    if (this.editGeneration === -1) return true;
    const generation = this.options.getSlotGeneration?.(row) ?? -1;
    if (generation === this.editGeneration) return true;
    if (generation === -1) return false;
    return this.options.getRowId?.(row) === this.editRowId;
  }

  /**
   * Cancel the current edit.
   * Discards changes and closes the editor.
   */
  cancel(editId?: number): void {
    if (this.isStaleSession(editId)) return;
    this.editState = null;
    this.editGeneration = -1;
    this.editRowId = undefined;
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
    this.peekState = null;
  }
}
