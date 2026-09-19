// packages/core/src/grid-core-operations.ts
// Column-interaction and data-refresh operations for GridCore. Each
// function encapsulates the batch-emit + cache-maintenance sequence for
// a single mutation so the GridCore facade stays thin.

import type { DataSource, ColumnDefinition, ColumnId, FilterModel, SortModel } from "./types";
import { getColumnId } from "./column-model";
import type { SlotPoolManager } from "./slot-pool";
import type { HighlightManager } from "./managers";
import type { ViewSync } from "./grid-core-view-sync";
import { buildDataSourceRequest, reorderCachedRows } from "./utils";

export interface ColumnOperationDeps<TData> {
  /** Current resolved layout. Never mutated by these operations. */
  getLayout: () => ColumnDefinition[];
  /** Write the stored width for a column ID and re-resolve the layout. */
  setColumnWidth: (columnId: ColumnId, storedWidth: number) => void;
  /** Move a column and re-resolve; returns the applied target index or null. */
  moveColumn: (fromIndex: number, toIndex: number) => number | null;
  computeColumnPositions: () => void;
  view: ViewSync<TData>;
}

/** Result of a resize/move for the caller to emit as an identity event. */
export interface ColumnOperationResult {
  columnId: ColumnId;
  fromViewIndex: number;
  toViewIndex: number;
}

/**
 * Convert a desired displayed width to the stored width that produces it
 * after `calculateScaledColumnPositions` redistributes leftover viewport
 * space across visible columns.
 *
 * Why: the resize handle reports the scaled (displayed) width the user
 * dragged to, but redistribution would scale it up again on the next
 * render, leaving the column wider than the ghost. Back-solving keeps
 * the post-redistribution width equal to the displayed width.
 */
const computeStoredWidthForDisplayed = (
  colIndex: number,
  displayedWidth: number,
  viewportWidth: number,
  columns: ColumnDefinition[],
): number => {
  if (viewportWidth <= 0) return displayedWidth;
  let otherTotal = 0;
  for (let i = 0; i < columns.length; i++) {
    if (i === colIndex) continue;
    const col = columns[i];
    if (!col || col.hidden) continue;
    otherTotal += col.width;
  }
  if (otherTotal <= 0) return displayedWidth;
  if (displayedWidth + otherTotal >= viewportWidth) return displayedWidth;
  return (displayedWidth * otherTotal) / (viewportWidth - displayedWidth);
};

export const applyColumnResize = <TData>(
  colIndex: number,
  displayedWidth: number,
  viewportWidth: number,
  deps: ColumnOperationDeps<TData>,
): { columnId: ColumnId; width: number } | null => {
  const layout = deps.getLayout();
  const column = layout[colIndex];
  if (column === undefined) return null;
  const storedWidth = column.hidden
    ? displayedWidth
    : computeStoredWidthForDisplayed(colIndex, displayedWidth, viewportWidth, layout);
  deps.setColumnWidth(getColumnId(column), storedWidth);
  deps.computeColumnPositions();
  deps.view.syncColumnLayout("geometry");
  return { columnId: getColumnId(column), width: displayedWidth };
};

export const applyColumnMove = <TData>(
  fromIndex: number,
  toIndex: number,
  deps: ColumnOperationDeps<TData>,
): ColumnOperationResult | null => {
  const column = deps.getLayout()[fromIndex];
  if (column === undefined) return null;
  const adjustedTo = deps.moveColumn(fromIndex, toIndex);
  if (adjustedTo === null) return null;
  deps.computeColumnPositions();
  deps.view.syncColumnLayout("order");
  return {
    columnId: getColumnId(column),
    fromViewIndex: fromIndex,
    toViewIndex: adjustedTo,
  };
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
  sortModel: SortModel[];
  filterModel: FilterModel;
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
  const response = await deps.dataSource.query(
    buildDataSourceRequest({
      range: { startRow: 0, endRow: Number.MAX_SAFE_INTEGER },
      sortModel: deps.sortModel,
      filterModel: deps.filterModel,
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
