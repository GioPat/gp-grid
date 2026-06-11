export interface PendingCellTapRecord {
  rowIndex: number;
  colIndex: number;
}

/**
 * Holds the "touch-down waiting for tap confirmation" state between a
 * touch-down on a cell and the moment the pointer is released within the
 * tap slop. Selection is applied only on confirmation, so a scroll gesture
 * never selects a cell (and never shows the fill handle).
 */
export class PendingCellTapState {
  private record: PendingCellTapRecord | null = null;

  set(record: PendingCellTapRecord): void {
    this.record = record;
  }

  clear(): void {
    this.record = null;
  }

  consume(): PendingCellTapRecord | null {
    const record = this.record;
    this.record = null;
    return record;
  }
}
