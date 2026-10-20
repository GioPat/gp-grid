// packages/core/src/grid-core-history.ts
// `GridCore.history`: undo and redo over the write commands (PRD 013 D4).

import type { ColumnDefinition } from "./types";
import type { RowDataManager } from "./managers/row-data-manager";
import type { RecordWrites } from "./grid-core-record-writes";
import type { WriteHistory } from "./history/write-history";
import { applyEntry, type HistoryApplyDeps, type HistoryDirection } from "./history/history-apply";

export interface GridHistoryApi {
  /** False without the `history` option: nothing is recorded and the keys reach the browser. */
  isEnabled(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  /** True when an entry was written back; false on an empty stack or a refused entry. */
  undo(): boolean;
  redo(): boolean;
  clear(): void;
}

export interface HistoryControllerDeps<TData> {
  history: WriteHistory | null;
  rowData: RowDataManager<TData>;
  writes: RecordWrites;
  getColumns: () => ColumnDefinition[];
}

export class HistoryController<TData> implements GridHistoryApi {
  private readonly deps: HistoryControllerDeps<TData>;

  constructor(deps: HistoryControllerDeps<TData>) {
    this.deps = deps;
  }

  isEnabled(): boolean {
    return this.deps.history !== null;
  }

  canUndo(): boolean {
    return this.deps.history?.canUndo() ?? false;
  }

  canRedo(): boolean {
    return this.deps.history?.canRedo() ?? false;
  }

  undo(): boolean {
    return this.deps.history?.undo((entry) => applyEntry(entry, "undo", this.applyDeps())) ?? false;
  }

  redo(): boolean {
    return this.deps.history?.redo((entry) => applyEntry(entry, "redo", this.applyDeps())) ?? false;
  }

  clear(): void {
    this.deps.history?.clear();
  }

  private applyDeps(): HistoryApplyDeps {
    const { rowData, writes, getColumns } = this.deps;
    return {
      isWritable: () => rowData.isWritable(),
      readFieldById: (rowId, field) => rowData.readRecordField(rowId, field),
      writeRecordValue: (rowId, columnId, field, value) => {
        writes.setRecordValue(rowId, columnId, field, value);
      },
      run: (operation: HistoryDirection, command) => writes.run(operation, command),
      findViewIndexById: (rowId) => rowData.findViewIndexById(rowId),
      columnIndexOf: (columnId) => getColumns().findIndex((column) => (column.colId ?? column.field) === columnId),
      reject: (event) => writes.reject(event),
    };
  }
}
