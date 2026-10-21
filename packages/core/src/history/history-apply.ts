// packages/core/src/history/history-apply.ts
// Applying one history entry (PRD 013 D4): every change is checked first,
// then all are written through one write command, or none is.

import type { CellValue, CellWriteRejectedEvent, RowId, WriteChange, WriteRejectionReason } from "../types";
import type { HistoryEntry } from "./write-history";

export type HistoryDirection = "undo" | "redo";

/** A record's field, or `found: false` when no record answers the id. */
export interface RecordFieldRead {
  found: boolean;
  value: CellValue;
}

export interface HistoryApplyDeps {
  isWritable(): boolean;
  readFieldById(rowId: RowId, field: string): RecordFieldRead;
  /** The by-id write of the open command; the checks above make a refusal impossible. */
  writeRecordValue(rowId: RowId, columnId: string, field: string, value: CellValue): void;
  run(operation: HistoryDirection, command: () => void): void;
  findViewIndexById(rowId: RowId): number;
  columnIndexOf(columnId: string): number;
  reject(event: CellWriteRejectedEvent): void;
}

interface Refusal {
  change: WriteChange;
  reason: WriteRejectionReason;
}

/** `Object.is`, except that two dates with the same time are the same value. */
export const sameCellValue = (a: CellValue, b: CellValue): boolean => {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return Object.is(a, b);
};

/** What the cell must still hold for the entry to apply. */
const expectedValue = (change: WriteChange, direction: HistoryDirection): CellValue =>
  direction === "undo" ? change.newValue : change.oldValue;

const valueToWrite = (change: WriteChange, direction: HistoryDirection): CellValue =>
  direction === "undo" ? change.oldValue : change.newValue;

const findRefusal = (entry: HistoryEntry, direction: HistoryDirection, deps: HistoryApplyDeps): Refusal | null => {
  const first = entry.changes[0];
  if (first === undefined) return null;
  if (deps.isWritable() === false) return { change: first, reason: "read-only-source" };
  for (const change of entry.changes) {
    const current = deps.readFieldById(change.rowId, change.field);
    if (current.found === false) return { change, reason: "missing-record" };
    if (sameCellValue(current.value, expectedValue(change, direction)) === false) return { change, reason: "conflict" };
  }
  return null;
};

/** Writes the whole entry back, or nothing: a refusal is reported once and answers false. */
export const applyEntry = (entry: HistoryEntry, direction: HistoryDirection, deps: HistoryApplyDeps): boolean => {
  const refusal = findRefusal(entry, direction, deps);
  if (refusal !== null) {
    deps.reject({
      row: deps.findViewIndexById(refusal.change.rowId),
      col: deps.columnIndexOf(refusal.change.columnId),
      field: refusal.change.field,
      reason: refusal.reason,
      operation: direction,
    });
    return false;
  }
  const ordered = direction === "undo" ? [...entry.changes].reverse() : entry.changes;
  deps.run(direction, () => {
    for (const change of ordered) {
      deps.writeRecordValue(change.rowId, change.columnId, change.field, valueToWrite(change, direction));
    }
  });
  return true;
};
