// packages/core/src/grid-core-row-drag.ts
// `GridCore.rowDrag`: committing a row reorder.

import type { HighlightManager } from "./managers";
import type { RowDataManager } from "./managers/row-data-manager";
import type { SlotPoolManager } from "./slot-pool";
import type { GridCoreConfig } from "./grid-core-config";
import { applyRowDragCommit } from "./grid-core-operations";

export interface GridRowDragApi {
  /**
   * Move a row when the source supports `moveRow`, then fire `onRowDragEnd`.
   * The cache is reordered in place, so only the affected slots update.
   */
  commit(sourceIndex: number, targetIndex: number): void;
  /** Whether the whole row, not only the drag handle, starts a drag. */
  isEntireRow(): boolean;
}

export interface RowDragControllerDeps<TData> {
  config: GridCoreConfig<TData>;
  rowData: RowDataManager<TData>;
  slotPool: SlotPoolManager;
  highlight: HighlightManager<TData> | null;
  /** The move changed row identity, so heights must be re-placed (D6). */
  onRowsMoved: () => void;
}

export class RowDragController<TData> implements GridRowDragApi {
  private readonly deps: RowDragControllerDeps<TData>;

  constructor(deps: RowDragControllerDeps<TData>) {
    this.deps = deps;
  }

  commit(sourceIndex: number, targetIndex: number): void {
    const { rowData } = this.deps;
    if (rowData.isWritable() === false) {
      rowData.rejectWrite(sourceIndex, -1, "row-move");
      return;
    }
    // Read identity first: the commit reorders the cache under these indices.
    const rowId = rowData.getRowId(sourceIndex) ?? sourceIndex;
    const moved = applyRowDragCommit(sourceIndex, targetIndex, {
      dataSource: rowData.getDataSource(),
      cachedRows: rowData.getCachedRows(),
      slotPool: this.deps.slotPool,
      highlight: this.deps.highlight,
    });
    if (moved) this.deps.onRowsMoved();
    this.deps.config.onRowDragEnd?.({
      rowId,
      fromViewIndex: sourceIndex,
      toViewIndex: targetIndex,
    });
  }

  isEntireRow(): boolean {
    return this.deps.config.rowDragEntireRow;
  }
}
