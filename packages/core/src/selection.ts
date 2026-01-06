// gp-grid-core/src/selection.ts

import type {
  CellPosition,
  CellRange,
  SelectionState,
  GridInstruction,
  InstructionListener,
  CellValue,
  ColumnDefinition,
  Row,
} from "./types";

export type Direction = "up" | "down" | "left" | "right";

export interface SelectionManagerOptions {
  getRowCount: () => number;
  getColumnCount: () => number;
  getCellValue: (row: number, col: number) => CellValue;
  getRowData: (row: number) => Row | undefined;
  getColumn: (col: number) => ColumnDefinition | undefined;
}

/**
 * Manages Excel-style cell selection, keyboard navigation, and clipboard operations.
 */
export class SelectionManager {
  private state: SelectionState = {
    activeCell: null,
    range: null,
    anchor: null,
    selectionMode: false,
  };

  private options: SelectionManagerOptions;
  private listeners: InstructionListener[] = [];

  constructor(options: SelectionManagerOptions) {
    this.options = options;
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
  // State Accessors
  // ===========================================================================

  getState(): SelectionState {
    return { ...this.state };
  }

  getActiveCell(): CellPosition | null {
    return this.state.activeCell;
  }

  getSelectionRange(): CellRange | null {
    return this.state.range;
  }

  isSelected(row: number, col: number): boolean {
    const { range } = this.state;
    if (!range) return false;

    const minRow = Math.min(range.startRow, range.endRow);
    const maxRow = Math.max(range.startRow, range.endRow);
    const minCol = Math.min(range.startCol, range.endCol);
    const maxCol = Math.max(range.startCol, range.endCol);

    return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;
  }

  isActiveCell(row: number, col: number): boolean {
    const { activeCell } = this.state;
    return activeCell?.row === row && activeCell?.col === col;
  }

  // ===========================================================================
  // Selection Operations
  // ===========================================================================

  /**
   * Start a selection at the given cell.
   * @param cell - The cell to select
   * @param opts.shift - Extend selection from anchor (range select)
   * @param opts.ctrl - Toggle selection mode
   */
  startSelection(
    cell: CellPosition,
    opts: { shift?: boolean; ctrl?: boolean } = {}
  ): void {
    // console.log("[GP-Grid Selection] startSelection:", { cell, opts, listenerCount: this.listeners.length });
    const { shift = false, ctrl = false } = opts;
    const { row, col } = this.clampPosition(cell);

    if (shift && this.state.anchor) {
      // Extend selection from anchor to current cell
      this.state.range = {
        startRow: this.state.anchor.row,
        startCol: this.state.anchor.col,
        endRow: row,
        endCol: col,
      };
      this.state.activeCell = { row, col };
    } else {
      // Start new selection
      this.state.activeCell = { row, col };
      this.state.anchor = { row, col };
      this.state.range = null;
    }

    this.state.selectionMode = ctrl;

    // console.log("[GP-Grid Selection] Emitting SET_ACTIVE_CELL:", this.state.activeCell);
    this.emit({ type: "SET_ACTIVE_CELL", position: this.state.activeCell });
    // console.log("[GP-Grid Selection] Emitting SET_SELECTION_RANGE:", this.state.range);
    this.emit({ type: "SET_SELECTION_RANGE", range: this.state.range });
  }

  /**
   * Move focus in a direction, optionally extending the selection.
   */
  moveFocus(direction: Direction, extend: boolean = false): void {
    if (!this.state.activeCell) {
      // No active cell, select first cell
      this.startSelection({ row: 0, col: 0 });
      return;
    }

    const { row, col } = this.state.activeCell;
    let newRow = row;
    let newCol = col;

    switch (direction) {
      case "up":
        newRow = Math.max(0, row - 1);
        break;
      case "down":
        newRow = Math.min(this.options.getRowCount() - 1, row + 1);
        break;
      case "left":
        newCol = Math.max(0, col - 1);
        break;
      case "right":
        newCol = Math.min(this.options.getColumnCount() - 1, col + 1);
        break;
    }

    if (extend) {
      // Extend selection (Shift+Arrow)
      if (!this.state.anchor) {
        this.state.anchor = { row, col };
      }

      this.state.range = {
        startRow: this.state.anchor.row,
        startCol: this.state.anchor.col,
        endRow: newRow,
        endCol: newCol,
      };
      this.state.activeCell = { row: newRow, col: newCol };

      this.emit({ type: "SET_ACTIVE_CELL", position: this.state.activeCell });
      this.emit({ type: "SET_SELECTION_RANGE", range: this.state.range });
    } else {
      // Move without extending
      this.state.activeCell = { row: newRow, col: newCol };
      this.state.anchor = { row: newRow, col: newCol };
      this.state.range = null;

      this.emit({ type: "SET_ACTIVE_CELL", position: this.state.activeCell });
      this.emit({ type: "SET_SELECTION_RANGE", range: null });
    }
  }

  /**
   * Select all cells in the grid (Ctrl+A).
   */
  selectAll(): void {
    const rowCount = this.options.getRowCount();
    const colCount = this.options.getColumnCount();

    if (rowCount === 0 || colCount === 0) return;

    this.state.range = {
      startRow: 0,
      startCol: 0,
      endRow: rowCount - 1,
      endCol: colCount - 1,
    };

    // Keep active cell if exists, otherwise set to first cell
    if (!this.state.activeCell) {
      this.state.activeCell = { row: 0, col: 0 };
      this.emit({ type: "SET_ACTIVE_CELL", position: this.state.activeCell });
    }

    this.emit({ type: "SET_SELECTION_RANGE", range: this.state.range });
  }

  /**
   * Clear the current selection.
   */
  clearSelection(): void {
    this.state.activeCell = null;
    this.state.range = null;
    this.state.anchor = null;
    this.state.selectionMode = false;

    this.emit({ type: "SET_ACTIVE_CELL", position: null });
    this.emit({ type: "SET_SELECTION_RANGE", range: null });
  }

  /**
   * Set the active cell directly.
   */
  setActiveCell(row: number, col: number): void {
    const clamped = this.clampPosition({ row, col });
    this.state.activeCell = clamped;
    this.state.anchor = clamped;
    this.state.range = null;

    this.emit({ type: "SET_ACTIVE_CELL", position: this.state.activeCell });
    this.emit({ type: "SET_SELECTION_RANGE", range: null });
  }

  /**
   * Set the selection range directly.
   */
  setSelectionRange(range: CellRange): void {
    this.state.range = range;
    this.emit({ type: "SET_SELECTION_RANGE", range: this.state.range });
  }

  // ===========================================================================
  // Data Extraction
  // ===========================================================================

  /**
   * Get the data from the currently selected cells as a 2D array.
   */
  getSelectedData(): CellValue[][] {
    const { range, activeCell } = this.state;

    if (!range && !activeCell) {
      return [];
    }

    const effectiveRange = range || {
      startRow: activeCell!.row,
      startCol: activeCell!.col,
      endRow: activeCell!.row,
      endCol: activeCell!.col,
    };

    const minRow = Math.min(effectiveRange.startRow, effectiveRange.endRow);
    const maxRow = Math.max(effectiveRange.startRow, effectiveRange.endRow);
    const minCol = Math.min(effectiveRange.startCol, effectiveRange.endCol);
    const maxCol = Math.max(effectiveRange.startCol, effectiveRange.endCol);

    const data: CellValue[][] = [];

    for (let r = minRow; r <= maxRow; r++) {
      const row: CellValue[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        row.push(this.options.getCellValue(r, c));
      }
      data.push(row);
    }

    return data;
  }

  /**
   * Copy the selected data to the clipboard (Ctrl+C).
   */
  async copySelectionToClipboard(): Promise<void> {
    // Guard for SSR - clipboard APIs not available in Node.js
    if (typeof navigator === "undefined" || typeof document === "undefined") {
      return;
    }

    const data = this.getSelectedData();
    if (data.length === 0) return;

    // Convert to tab-separated values (Excel-compatible)
    const tsv = data
      .map((row) =>
        row.map((cell) => (cell == null ? "" : String(cell))).join("\t")
      )
      .join("\n");

    try {
      await navigator.clipboard.writeText(tsv);
    } catch (err) {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = tsv;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private clampPosition(pos: CellPosition): CellPosition {
    const rowCount = this.options.getRowCount();
    const colCount = this.options.getColumnCount();

    return {
      row: Math.max(0, Math.min(pos.row, rowCount - 1)),
      col: Math.max(0, Math.min(pos.col, colCount - 1)),
    };
  }
}

