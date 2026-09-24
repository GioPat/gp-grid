// packages/core/src/grid-core-rows.ts
// `GridCore.rows`: displayed rows, their identity and slot generations.

import type { RowId, ViewRow } from "./types";
import type { RowDataManager } from "./managers/row-data-manager";
import type { SlotPoolManager } from "./slot-pool";

export interface GridRowsApi<TData> {
  /** Number of displayed view rows (after sort/filter). */
  getCount(): number;
  /**
   * Stable identity for a view row when the source exposes one. Columnar
   * sources resolve it lazily; no per-row ID table is built on bind.
   */
  getId(viewIndex: number): RowId | undefined;
  getData(viewIndex: number): TData | undefined;
  /**
   * Whether a view row exists and can be rendered. A columnar row exists with
   * no source record, and a `null` cell value is still a value.
   */
  has(viewIndex: number): boolean;
  /**
   * A displayed row and its identity, built on request. Without a source
   * identity `id` is the view index, valid until the next sort, filter or refresh.
   */
  getViewRow(viewIndex: number): ViewRow<TData> | undefined;
  /**
   * Look up a source record by stable identity: resident rows and sources
   * with a direct lookup only; remote windows are not searched.
   */
  getRecordById(rowId: RowId): TData | undefined;
  /**
   * False when the bound source is read-only. Every write path (edit, paste,
   * fill, direct setter, row move) is refused centrally.
   */
  isWritable(): boolean;
  /** Assignment generation for a view row, or -1 when no slot serves it. */
  getSlotGeneration(viewIndex: number): number;
  isSlotGenerationCurrent(viewIndex: number, generation: number): boolean;
  /** Re-render mounted rows without refetching, e.g. after an in-place write. */
  refreshSlotData(): void;
}

export interface RowsControllerDeps<TData> {
  rowData: RowDataManager<TData>;
  slotPool: SlotPoolManager;
}

export class RowsController<TData> implements GridRowsApi<TData> {
  private readonly deps: RowsControllerDeps<TData>;

  constructor(deps: RowsControllerDeps<TData>) {
    this.deps = deps;
  }

  getCount(): number {
    return this.deps.rowData.getTotalRows();
  }

  getId(viewIndex: number): RowId | undefined {
    return this.deps.rowData.getRowId(viewIndex);
  }

  getData(viewIndex: number): TData | undefined {
    return this.deps.rowData.getRowData(viewIndex);
  }

  has(viewIndex: number): boolean {
    return this.deps.rowData.hasRow(viewIndex);
  }

  getViewRow(viewIndex: number): ViewRow<TData> | undefined {
    const { rowData } = this.deps;
    if (rowData.hasRow(viewIndex) === false) return undefined;
    return {
      kind: "record",
      id: rowData.getRowId(viewIndex) ?? viewIndex,
      viewIndex,
      record: rowData.getRowData(viewIndex),
    };
  }

  getRecordById(rowId: RowId): TData | undefined {
    return this.deps.rowData.getRecordById(rowId);
  }

  isWritable(): boolean {
    return this.deps.rowData.isWritable();
  }

  getSlotGeneration(viewIndex: number): number {
    return this.deps.slotPool.getSlotGeneration(viewIndex);
  }

  isSlotGenerationCurrent(viewIndex: number, generation: number): boolean {
    return this.deps.slotPool.getSlotGeneration(viewIndex) === generation;
  }

  refreshSlotData(): void {
    this.deps.slotPool.refreshAllSlots();
  }
}
