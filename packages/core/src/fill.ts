// gp-grid-core/src/fill.ts

import type {
  CellRange,
  CellValue,
  FillHandleState,
  GridInstruction,
  InstructionListener,
  ColumnDefinition,
} from "./types";

export interface FillManagerOptions {
  getRowCount: () => number;
  getColumnCount: () => number;
  getCellValue: (row: number, col: number) => CellValue;
  getColumn: (col: number) => ColumnDefinition | undefined;
  setCellValue: (row: number, col: number, value: CellValue) => void;
}

/**
 * Manages fill handle operations including pattern detection and auto-fill.
 */
export class FillManager {
  private state: FillHandleState | null = null;
  private options: FillManagerOptions;
  private listeners: InstructionListener[] = [];

  constructor(options: FillManagerOptions) {
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

  getState(): FillHandleState | null {
    return this.state ? { ...this.state } : null;
  }

  isActive(): boolean {
    return this.state !== null;
  }

  // ===========================================================================
  // Fill Handle Operations
  // ===========================================================================

  /**
   * Start a fill drag operation from a source range.
   */
  startFillDrag(sourceRange: CellRange): void {
    this.state = {
      sourceRange,
      targetRow: sourceRange.endRow,
      targetCol: sourceRange.endCol,
    };

    this.emit({ type: "START_FILL", sourceRange });
  }

  /**
   * Update the fill drag target position.
   */
  updateFillDrag(targetRow: number, targetCol: number): void {
    if (!this.state) return;

    // Clamp to valid bounds
    const rowCount = this.options.getRowCount();
    const colCount = this.options.getColumnCount();

    targetRow = Math.max(0, Math.min(targetRow, rowCount - 1));
    targetCol = Math.max(0, Math.min(targetCol, colCount - 1));

    this.state.targetRow = targetRow;
    this.state.targetCol = targetCol;

    this.emit({ type: "UPDATE_FILL", targetRow, targetCol });
  }

  /**
   * Commit the fill operation - apply pattern to target cells.
   */
  commitFillDrag(): void {
    if (!this.state) return;

    const { sourceRange, targetRow, targetCol } = this.state;
    const filledCells = this.calculateFilledCells(sourceRange, targetRow, targetCol);

    // Apply values
    for (const { row, col, value } of filledCells) {
      this.options.setCellValue(row, col, value);
    }

    this.emit({ type: "COMMIT_FILL", filledCells });

    this.state = null;
  }

  /**
   * Cancel the fill operation.
   */
  cancelFillDrag(): void {
    if (!this.state) return;

    this.state = null;
    this.emit({ type: "CANCEL_FILL" });
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Clean up resources for garbage collection.
   */
  destroy(): void {
    this.listeners = [];
    this.state = null;
  }

  // ===========================================================================
  // Pattern Detection & Fill Logic
  // ===========================================================================

  /**
   * Calculate the values to fill based on source pattern.
   */
  private calculateFilledCells(
    sourceRange: CellRange,
    targetRow: number,
    targetCol: number
  ): Array<{ row: number; col: number; value: CellValue }> {
    const result: Array<{ row: number; col: number; value: CellValue }> = [];

    const srcMinRow = Math.min(sourceRange.startRow, sourceRange.endRow);
    const srcMaxRow = Math.max(sourceRange.startRow, sourceRange.endRow);
    const srcMinCol = Math.min(sourceRange.startCol, sourceRange.endCol);
    const srcMaxCol = Math.max(sourceRange.startCol, sourceRange.endCol);

    // Determine fill direction (vertical only)
    const fillDown = targetRow > srcMaxRow;
    const fillUp = targetRow < srcMinRow;

    // Only vertical fills are supported
    if (fillDown || fillUp) {
      for (let col = srcMinCol; col <= srcMaxCol; col++) {
        const sourceValues = this.getSourceColumnValues(srcMinRow, srcMaxRow, col);
        const pattern = this.detectPattern(sourceValues);

        if (fillDown) {
          for (let row = srcMaxRow + 1; row <= targetRow; row++) {
            const fillIndex = row - srcMaxRow - 1;
            const value = this.applyPattern(pattern, sourceValues, fillIndex);
            result.push({ row, col, value });
          }
        } else if (fillUp) {
          for (let row = srcMinRow - 1; row >= targetRow; row--) {
            const fillIndex = srcMinRow - row - 1;
            const value = this.applyPattern(pattern, sourceValues, fillIndex, true);
            result.push({ row, col, value });
          }
        }
      }
    }

    return result;
  }

  private getSourceColumnValues(minRow: number, maxRow: number, col: number): CellValue[] {
    const values: CellValue[] = [];
    for (let row = minRow; row <= maxRow; row++) {
      values.push(this.options.getCellValue(row, col));
    }
    return values;
  }

  // ===========================================================================
  // Pattern Types
  // ===========================================================================

  private detectPattern(values: CellValue[]): FillPattern {
    if (values.length === 0) {
      return { type: "constant", value: null };
    }

    if (values.length === 1) {
      return { type: "constant", value: values[0] ?? null };
    }

    // Check for numeric sequence
    const numbers = values.map((v) => (typeof v === "number" ? v : Number(v)));
    if (numbers.every((n) => !isNaN(n))) {
      // Check for arithmetic sequence
      const diffs: number[] = [];
      for (let i = 1; i < numbers.length; i++) {
        diffs.push(numbers[i]! - numbers[i - 1]!);
      }

      const allSameDiff = diffs.every((d) => d === diffs[0]);
      if (allSameDiff && diffs[0] !== undefined) {
        return { type: "arithmetic", start: numbers[0]!, step: diffs[0] };
      }
    }

    // Check for repeating pattern
    return { type: "repeat", values };
  }

  private applyPattern(
    pattern: FillPattern,
    sourceValues: CellValue[],
    fillIndex: number,
    reverse: boolean = false
  ): CellValue {
    switch (pattern.type) {
      case "constant":
        return pattern.value;

      case "arithmetic": {
        const multiplier = reverse ? -(fillIndex + 1) : fillIndex + 1;
        const lastValue = reverse ? pattern.start : pattern.start + pattern.step * (sourceValues.length - 1);
        return lastValue + pattern.step * multiplier;
      }

      case "repeat": {
        const len = pattern.values.length;
        if (len === 0) return null;
        if (reverse) {
          // For reverse, cycle backwards
          const idx = (len - 1 - (fillIndex % len) + len) % len;
          return pattern.values[idx] ?? null;
        }
        return pattern.values[fillIndex % len] ?? null;
      }
    }
  }
}

// ===========================================================================
// Pattern Types
// ===========================================================================

type FillPattern =
  | { type: "constant"; value: CellValue }
  | { type: "arithmetic"; start: number; step: number }
  | { type: "repeat"; values: CellValue[] };

