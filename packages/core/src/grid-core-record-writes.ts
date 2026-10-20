// packages/core/src/grid-core-record-writes.ts
// One write command (an edit commit, a paste, a fill, `cells.setValue`) hands
// the hierarchy every record it wrote in one `recordsChanged` call and the
// application one `onWriteCommitted` with its changes and skips.

import type {
  CellValue,
  CellWriteRejectedEvent,
  ColumnDefinition,
  HierarchyRecordChange,
  WriteChange,
  WriteCommittedEvent,
  WriteOperation,
  WriteRejectionOperation,
} from "./types";
import type { RowDataManager } from "./managers/row-data-manager";

export interface RecordWrites {
  /** Runs one write command; the writes inside are reported together when it returns. */
  run<T>(operation: WriteOperation, command: () => T): T;
  /** False when the write was refused, and reported as `operation`. */
  setCellValue(row: number, col: number, value: CellValue, operation?: WriteRejectionOperation): boolean;
  /** Lists the refused target in the command's event and reports it. */
  reject(event: CellWriteRejectedEvent): void;
  /** Lists a target the command left out, without a rejection of its own. */
  skip(event: CellWriteRejectedEvent): void;
}

export interface RecordWritesDeps<TData> {
  getRowData: () => RowDataManager<TData>;
  getColumns: () => ColumnDefinition[];
  /** The view-rows applier; false when nothing changed. */
  applyViewRowsChange: (change: () => boolean) => boolean;
  refreshSlots: () => void;
  onWriteRejected?: (event: CellWriteRejectedEvent) => void;
  onWriteCommitted?: (event: WriteCommittedEvent) => void;
}

interface OpenCommand {
  readonly operation: WriteOperation;
  readonly changes: WriteChange[];
  readonly skipped: CellWriteRejectedEvent[];
  readonly written: HierarchyRecordChange[];
}

export const createRecordWrites = <TData>(deps: RecordWritesDeps<TData>): RecordWrites => {
  let open: OpenCommand | null = null;

  const report = (changes: readonly HierarchyRecordChange[]): void => {
    const hierarchy = deps.getRowData().getHierarchy();
    if (hierarchy?.recordsChanged === undefined || changes.length === 0) return;
    // A write keeps the record's id, so the applier's capture by id survives it.
    const moved = deps.applyViewRowsChange(() => hierarchy.recordsChanged?.(changes) === true);
    if (moved === false) deps.refreshSlots();
  };

  const close = (command: OpenCommand): void => {
    report(command.written);
    if (command.changes.length === 0 && command.skipped.length === 0) return;
    deps.onWriteCommitted?.({
      operation: command.operation,
      changes: command.changes,
      skipped: command.skipped,
    });
  };

  const run = <T>(operation: WriteOperation, command: () => T): T => {
    if (open !== null) return command();
    open = { operation, changes: [], skipped: [], written: [] };
    try {
      return command();
    } finally {
      const done = open;
      open = null;
      close(done);
    }
  };

  const setCellValue = (row: number, col: number, value: CellValue, operation?: WriteRejectionOperation): boolean => {
    const rowData = deps.getRowData();
    const column = deps.getColumns()[col];
    const oldValue = open === null ? null : rowData.getCellValue(row, col);
    if (rowData.setCellValue(row, col, value, operation) === false) return false;
    if (open === null || column === undefined) return true;
    const rowId = rowData.getRowId(row);
    if (rowId !== undefined) {
      open.changes.push({ rowId, columnId: column.colId ?? column.field, field: column.field, oldValue, newValue: value });
    }
    if (rowData.getHierarchy() !== null) open.written.push({ viewRow: row, field: column.field });
    return true;
  };

  const reject = (event: CellWriteRejectedEvent): void => {
    open?.skipped.push(event);
    deps.onWriteRejected?.(event);
  };

  const skip = (event: CellWriteRejectedEvent): void => {
    open?.skipped.push(event);
  };

  return { run, setCellValue, reject, skip };
};
