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
): void => {
  const ds = deps.dataSource as { moveRow?: (from: number, to: number) => void };
  if (!ds.moveRow) return;

  ds.moveRow(sourceIndex, targetIndex);
  reorderCachedRows(deps.cachedRows, sourceIndex, targetIndex);

  deps.highlight?.clearAllCaches();
  const lo = Math.min(sourceIndex, targetIndex);
  const hi = Math.max(sourceIndex, targetIndex);
  for (let i = lo; i <= hi; i++) deps.slotPool.updateSlot(i);
};

export interface RefreshTransactionDeps<TData> {
  dataSource: DataSource<TData>;
  sortFilter: SortFilterManager<TData>;
  cachedRows: Map<number, TData>;
  setTotalRows: (n: number) => void;
  visibleStart: number;
  visibleEnd: number;
  overscan: number;
}

export interface RefreshTransactionResult {
  totalRows: number;
}

export const refreshVisibleWindow = async <TData>(
  deps: RefreshTransactionDeps<TData>,
): Promise<RefreshTransactionResult> => {
  const start = Math.max(0, deps.visibleStart - deps.overscan);
  const end = deps.visibleEnd + deps.overscan;

  const response = await deps.dataSource.fetch(
    buildDataSourceRequest({
      pageIndex: 0,
      pageSize: end + 1,
      sortModel: deps.sortFilter.getSortModel(),
      filterModel: deps.sortFilter.getFilterModel(),
    }),
  );

  deps.setTotalRows(response.totalRows);
  for (let i = start; i < Math.min(end + 1, response.rows.length); i++) {
    const row = response.rows[i];
    if (row !== undefined) deps.cachedRows.set(i, row);
  }
  return { totalRows: response.totalRows };
};
