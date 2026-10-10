// packages/core/src/grid-core-record-writes.ts
// One write command (an edit commit, a paste, a fill, `cells.setValue`) hands
// the hierarchy every record it wrote in one `recordsChanged` call.

import type { CellValue, ColumnDefinition, HierarchyRecordChange, WriteRejectionOperation } from "./types";
import type { RowDataManager } from "./managers/row-data-manager";

export interface RecordWrites {
  /** Runs one write command; the writes inside are reported together when it returns. */
  run<T>(command: () => T): T;
  /** False when the write was refused, and reported as `operation`. */
  setCellValue(row: number, col: number, value: CellValue, operation?: WriteRejectionOperation): boolean;
}

export interface RecordWritesDeps<TData> {
  getRowData: () => RowDataManager<TData>;
  getColumns: () => ColumnDefinition[];
  /** The view-rows applier; false when nothing changed. */
  applyViewRowsChange: (change: () => boolean) => boolean;
  refreshSlots: () => void;
}

export const createRecordWrites = <TData>(deps: RecordWritesDeps<TData>): RecordWrites => {
  let written: HierarchyRecordChange[] | null = null;

  const report = (changes: readonly HierarchyRecordChange[]): void => {
    const hierarchy = deps.getRowData().getHierarchy();
    if (hierarchy?.recordsChanged === undefined || changes.length === 0) return;
    // A write keeps the record's id, so the applier's capture by id survives it.
    const moved = deps.applyViewRowsChange(() => hierarchy.recordsChanged?.(changes) === true);
    if (moved === false) deps.refreshSlots();
  };

  const run = <T>(command: () => T): T => {
    if (written !== null) return command();
    written = [];
    try {
      return command();
    } finally {
      const changes = written;
      written = null;
      report(changes);
    }
  };

  const setCellValue = (row: number, col: number, value: CellValue, operation?: WriteRejectionOperation): boolean => {
    const rowData = deps.getRowData();
    if (rowData.setCellValue(row, col, value, operation) === false) return false;
    const field = deps.getColumns()[col]?.field;
    if (written !== null && field !== undefined && rowData.getHierarchy() !== null) {
      written.push({ viewRow: row, field });
    }
    return true;
  };

  return { run, setCellValue };
};
