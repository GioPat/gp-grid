// packages/core/src/grid-core-record-writes.ts
// D6: one write command (an edit commit, a paste, a fill, `cells.setValue`)
// hands the hierarchy every record it wrote in one `recordsChanged` call.

import type { CellValue, ColumnDefinition, HierarchyRecordChange } from "./types";
import type { RowDataManager } from "./managers/row-data-manager";

export interface RecordWrites {
  /** Open a write command; the writes until `end` are reported together. */
  begin(): void;
  end(): void;
  setCellValue(row: number, col: number, value: CellValue): void;
}

export interface RecordWritesDeps<TData> {
  getRowData: () => RowDataManager<TData>;
  getColumns: () => ColumnDefinition[];
  /** The D4 applier; false when nothing changed. */
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

  return {
    begin: () => {
      written ??= [];
    },
    end: () => {
      const changes = written;
      written = null;
      if (changes !== null) report(changes);
    },
    setCellValue: (row, col, value) => {
      const rowData = deps.getRowData();
      if (rowData.setCellValue(row, col, value) === false) return;
      const field = deps.getColumns()[col]?.field;
      if (written === null || field === undefined || rowData.getHierarchy() === null) return;
      written.push({ viewRow: row, field });
    },
  };
};
