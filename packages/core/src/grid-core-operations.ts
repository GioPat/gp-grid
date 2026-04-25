// packages/core/src/grid-core-operations.ts
// Column-interaction and data-refresh operations for GridCore. Each
// function encapsulates the batch-emit + cache-maintenance sequence for
// a single mutation so the GridCore facade stays thin.

import type { DataSource, ColumnDefinition } from "./types";
import type { SlotPoolManager } from "./slot-pool";
import type {
  HighlightManager,
  InstructionBatcher,
  SortFilterManager,
} from "./managers";
import { buildDataSourceRequest, reorderCachedRows } from "./utils";

export interface ColumnOperationDeps<TData> {
  batcher: InstructionBatcher;
  slotPool: SlotPoolManager;
  refreshSlots: "sync" | "all";
  computeColumnPositions: () => void;
  emitContentSize: () => void;
  emitHeaders: () => void;
  columns: ColumnDefinition[];
  onComplete: () => void;
  highlight?: HighlightManager<TData> | null;
}

const emitColumnLayoutBatch = <TData>(deps: ColumnOperationDeps<TData>): void => {
  deps.computeColumnPositions();
  deps.batcher.start();
  try {
    deps.emitContentSize();
    deps.emitHeaders();
    deps.batcher.emit({ type: "COLUMNS_CHANGED", columns: [...deps.columns] });
    if (deps.refreshSlots === "sync") deps.slotPool.syncSlots();
    else deps.slotPool.refreshAllSlots();
  } finally {
    deps.batcher.flush();
  }
  deps.onComplete();
};

export const applyColumnResize = <TData>(
  colIndex: number,
  width: number,
  deps: ColumnOperationDeps<TData>,
): void => {
  const column = deps.columns[colIndex];
  if (!column) return;
  column.width = width;
  emitColumnLayoutBatch({ ...deps, refreshSlots: "sync" });
};

export const applyColumnMove = <TData>(
  fromIndex: number,
  toIndex: number,
  deps: ColumnOperationDeps<TData>,
): number | null => {
  if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= deps.columns.length) return null;
  const adjustedTo = toIndex > fromIndex ? toIndex - 1 : toIndex;
  if (adjustedTo < 0 || adjustedTo >= deps.columns.length) return null;
  if (fromIndex === adjustedTo) return null;

  const [col] = deps.columns.splice(fromIndex, 1);
  deps.columns.splice(adjustedTo, 0, col!);

  emitColumnLayoutBatch({ ...deps, refreshSlots: "all" });
  return adjustedTo;
};

export interface RowDragCommitDeps<TData> {
  dataSource: DataSource<TData>;
  cachedRows: Map<number, TData>;
  slotPool: SlotPoolManager;
  highlight: HighlightManager<TData> | null;
}

export const applyRowDragCommit = <TData>(
  sourceIndex: number,
  targetIndex: number,
  deps: RowDragCommitDeps<TData>,
): boolean => {
  const ds = deps.dataSource as { moveRow?: (from: number, to: number) => void };
  if (!ds.moveRow) return false;

  ds.moveRow(sourceIndex, targetIndex);
  reorderCachedRows(deps.cachedRows, sourceIndex, targetIndex);

  deps.highlight?.clearAllCaches();
  const lo = Math.min(sourceIndex, targetIndex);
  const hi = Math.max(sourceIndex, targetIndex);
  for (let i = lo; i <= hi; i++) deps.slotPool.updateSlot(i);
  return true;
};

export interface RefreshTransactionDeps<TData> {
  dataSource: DataSource<TData>;
  sortFilter: SortFilterManager<TData>;
  cachedRows: Map<number, TData>;
  setTotalRows: (n: number) => void;
  getColumns: () => ColumnDefinition[];
}

export interface RefreshTransactionResult {
  totalRows: number;
}

/**
 * Re-fetch all rows from the data source and replace the cache. Unlike
 * `fetchData`, this does not emit DATA_LOADING/DATA_LOADED, so it can be used
 * on every transaction without causing UI flicker. Fetching the full range is
 * necessary so rows added beyond the current visible window are cached and
 * become available when the user scrolls to them.
 */
export const refreshTransactionData = async <TData>(
  deps: RefreshTransactionDeps<TData>,
): Promise<RefreshTransactionResult> => {
  const response = await deps.dataSource.fetch(
    buildDataSourceRequest({
      pageIndex: 0,
      pageSize: Number.MAX_SAFE_INTEGER,
      sortModel: deps.sortFilter.getSortModel(),
      filterModel: deps.sortFilter.getFilterModel(),
      columns: deps.getColumns(),
    }),
  );

  deps.cachedRows.clear();
  for (let i = 0; i < response.rows.length; i++) {
    const row = response.rows[i];
    if (row !== undefined) deps.cachedRows.set(i, row);
  }
  deps.setTotalRows(response.totalRows);
  return { totalRows: response.totalRows };
};
