// @gp-grid/core/src/selection.ts

import type {
  CellPosition,
  CellRange,
  SelectionState,
  CellValue,
  ColumnDefinition,
} from "./types";
import { createInstructionEmitter, normalizeRange, formatCellValue } from "./utils";
import {
  coerceClipboardValue,
  normalizeClipboardText,
  parseClipboardText,
  type ClipboardCell,
  type ClipboardMatrix,
} from "./utils/clipboard-helpers";

export type Direction = "up" | "down" | "left" | "right";

export interface SelectionManagerOptions {
  getRowCount: () => number;
  getColumnCount: () => number;
  getCellValue: (row: number, col: number) => CellValue;
  getRowData: (row: number) => unknown;
  getColumn: (col: number) => ColumnDefinition | undefined;
  setCellValue: (row: number, col: number, value: CellValue) => void;
}

export interface PasteResult {
  handled: boolean;
  changedCells: Array<{ row: number; col: number; value: CellValue }>;
}

interface ClipboardSnapshot {
  text: string;
  cells: ClipboardMatrix;
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

  private readonly options: SelectionManagerOptions;
  private readonly emitter = createInstructionEmitter();
  private clipboardSnapshot: ClipboardSnapshot | null = null;

  // Public API delegates to emitter
  onInstruction = this.emitter.onInstruction;
  private readonly emit = this.emitter.emit;

  constructor(options: SelectionManagerOptions) {
    this.options = options;
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

    const { minRow, maxRow, minCol, maxCol } = normalizeRange(range);
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

    this.emit({ type: "SET_ACTIVE_CELL", position: this.state.activeCell });
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
      this.state.anchor ??= { row, col };

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
    const effectiveRange = this.getEffectiveRange();
    if (effectiveRange === null) {
      return [];
    }

    const { minRow, maxRow, minCol, maxCol } = normalizeRange(effectiveRange);
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
    const effectiveRange = this.getEffectiveRange();
    if (effectiveRange === null) return;

    const snapshot = this.createClipboardSnapshot(effectiveRange);
    if (snapshot.cells.length === 0) return;

    this.clipboardSnapshot = snapshot;

    // Guard for SSR - clipboard APIs not available in Node.js
    if (typeof navigator === "undefined" || typeof document === "undefined") {
      return;
    }

    await navigator.clipboard.writeText(snapshot.text);
  }

  /**
   * Paste text data into the active cell or selected target range.
   */
  pasteClipboardText(text: string): PasteResult {
    const effectiveRange = this.getEffectiveRange();
    if (effectiveRange === null) {
      return { handled: false, changedCells: [] };
    }

    const sourceCells = this.getPasteSourceCells(text);
    if (sourceCells.length === 0) {
      return { handled: false, changedCells: [] };
    }

    const changedCells = this.applyPasteSource(
      sourceCells,
      effectiveRange,
      this.state.range !== null,
    );
    return { handled: true, changedCells };
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Clean up resources for garbage collection.
   */
  destroy(): void {
    this.emitter.clearListeners();
    this.state = {
      activeCell: null,
      range: null,
      anchor: null,
      selectionMode: false,
    };
    this.clipboardSnapshot = null;
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

  private getEffectiveRange(): CellRange | null {
    const { range, activeCell } = this.state;
    if (range) return range;
    if (activeCell) {
      return {
        startRow: activeCell.row,
        startCol: activeCell.col,
        endRow: activeCell.row,
        endCol: activeCell.col,
      };
    }

    return null;
  }

  private createClipboardSnapshot(range: CellRange): ClipboardSnapshot {
    const { minRow, maxRow, minCol, maxCol } = normalizeRange(range);
    const cells: ClipboardMatrix = [];

    for (let row = minRow; row <= maxRow; row++) {
      const rowCells: ClipboardCell[] = [];
      for (let col = minCol; col <= maxCol; col++) {
        const value = this.options.getCellValue(row, col);
        const text = formatCellValue(
          value,
          this.options.getColumn(col)?.valueFormatter,
        );
        rowCells.push({ value, text });
      }
      cells.push(rowCells);
    }

    return {
      cells,
      text: cells.map((row) => row.map((cell) => cell.text).join("\t")).join("\n"),
    };
  }

  private getPasteSourceCells(text: string): ClipboardMatrix {
    const snapshot = this.clipboardSnapshot;
    if (snapshot && normalizeClipboardText(snapshot.text) === normalizeClipboardText(text)) {
      return snapshot.cells;
    }

    return parseClipboardText(text);
  }

  private applyPasteSource(
    sourceCells: ClipboardMatrix,
    targetRange: CellRange,
    targetIsSelection: boolean,
  ): Array<{ row: number; col: number; value: CellValue }> {
    const changedCells: Array<{ row: number; col: number; value: CellValue }> = [];
    const { minRow, maxRow, minCol, maxCol } = normalizeRange(targetRange);
    const isSingleSourceCell = this.isSingleSourceCell(sourceCells);

    const sourceMaxRow = isSingleSourceCell
      ? maxRow
      : minRow + sourceCells.length - 1;
    const sourceMaxCol = isSingleSourceCell
      ? maxCol
      : minCol + this.getMaxSourceColumnCount(sourceCells) - 1;
    const targetMaxRow = targetIsSelection
      ? Math.min(sourceMaxRow, maxRow)
      : sourceMaxRow;
    const targetMaxCol = targetIsSelection
      ? Math.min(sourceMaxCol, maxCol)
      : sourceMaxCol;

    const rowCount = this.options.getRowCount();
    const colCount = this.options.getColumnCount();
    const boundedMaxRow = Math.min(targetMaxRow, rowCount - 1);
    const boundedMaxCol = Math.min(targetMaxCol, colCount - 1);

    for (let row = minRow; row <= boundedMaxRow; row++) {
      for (let col = minCol; col <= boundedMaxCol; col++) {
        const sourceCell = this.getSourceCellForTarget(
          sourceCells,
          row - minRow,
          col - minCol,
          isSingleSourceCell,
        );
        if (sourceCell) {
          this.applyPasteCell(row, col, sourceCell, changedCells);
        }
      }
    }

    return changedCells;
  }

  private applyPasteCell(
    row: number,
    col: number,
    sourceCell: ClipboardCell,
    changedCells: Array<{ row: number; col: number; value: CellValue }>,
  ): void {
    const column = this.options.getColumn(col);
    if (column === undefined) return;
    if (column.hidden === true) return;
    if (column.editable !== true) return;

    const coerced = coerceClipboardValue(sourceCell, column);
    if (coerced.ok === false) return;

    this.options.setCellValue(row, col, coerced.value);
    changedCells.push({ row, col, value: coerced.value });
  }

  private getSourceCellForTarget(
    sourceCells: ClipboardMatrix,
    rowOffset: number,
    colOffset: number,
    isSingleSourceCell: boolean,
  ): ClipboardCell | null {
    if (isSingleSourceCell) {
      return sourceCells[0]?.[0] ?? null;
    }

    return sourceCells[rowOffset]?.[colOffset] ?? null;
  }

  private isSingleSourceCell(sourceCells: ClipboardMatrix): boolean {
    return sourceCells.length === 1 && sourceCells[0]?.length === 1;
  }

  private getMaxSourceColumnCount(sourceCells: ClipboardMatrix): number {
    return sourceCells.reduce(
      (maxCount, row) => Math.max(maxCount, row.length),
      0,
    );
  }
}
