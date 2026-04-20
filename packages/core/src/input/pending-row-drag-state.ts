export interface PendingRowDragRecord {
  rowIndex: number;
  colIndex: number;
  clientX: number;
  clientY: number;
}

/**
 * Holds the "touch long-press waiting" state between a touch-down on a
 * draggable row and the moment the framework confirms the long-press
 * timer fired. On confirm, the caller promotes this record to an active
 * row drag via `consume()`.
 */
export class PendingRowDragState {
  private record: PendingRowDragRecord | null = null;

  set(record: PendingRowDragRecord): void {
    this.record = record;
  }

  clear(): void {
    this.record = null;
  }

  consume(): PendingRowDragRecord | null {
    const record = this.record;
    this.record = null;
    return record;
  }
}
