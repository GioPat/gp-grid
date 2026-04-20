import type { GridCore } from "../grid-core";
import type { CellPosition, CellRange } from "../types/basic";
import type { InputResult } from "../types/input";

export class FillDrag<TData = unknown> {
  private active = false;
  private sourceRange: CellRange | null = null;
  private target: { row: number; col: number } | null = null;
  private readonly core: GridCore<TData>;

  constructor(core: GridCore<TData>) {
    this.core = core;
  }

  get isActive(): boolean {
    return this.active;
  }

  get stateSnapshot(): {
    sourceRange: CellRange | null;
    target: { row: number; col: number } | null;
  } {
    return { sourceRange: this.sourceRange, target: this.target };
  }

  start(
    activeCell: CellPosition | null,
    selectionRange: CellRange | null,
  ): InputResult {
    if (!activeCell && !selectionRange) {
      return { preventDefault: false, stopPropagation: false };
    }

    const sourceRange: CellRange = selectionRange ?? {
      startRow: activeCell!.row,
      startCol: activeCell!.col,
      endRow: activeCell!.row,
      endCol: activeCell!.col,
    };

    this.core.fill.startFillDrag(sourceRange);
    this.sourceRange = sourceRange;
    this.target = {
      row: Math.max(sourceRange.startRow, sourceRange.endRow),
      col: Math.max(sourceRange.startCol, sourceRange.endCol),
    };
    this.active = true;

    return { preventDefault: true, stopPropagation: true, startDrag: "fill" };
  }

  moveToTarget(row: number, col: number): void {
    if (this.active === false) return;
    this.core.fill.updateFillDrag(row, col);
    this.target = { row, col };
  }

  end(): void {
    if (this.active) {
      this.core.fill.commitFillDrag();
      this.core.refreshSlotData();
    }
    this.active = false;
    this.sourceRange = null;
    this.target = null;
  }
}
