// packages/react/src/useGridData.ts

import { useMemo } from "react";
import { createMutableClientDataSource } from "@gp-grid/core";
import type { Row, RowId, CellValue, MutableDataSource, ParallelSortOptions } from "@gp-grid/core";

export interface UseGridDataOptions<TData> {
  /** Function to extract a unique ID from each row. Required. */
  getRowId: (row: TData) => RowId;
  /** Debounce time for batching transactions in ms. Default 50. */
  debounceMs?: number;
  /** Use Web Worker for sorting large datasets (default: true) */
  useWorker?: boolean;
  /** Options for parallel sorting (only used when useWorker is true) */
  parallelSort?: ParallelSortOptions | false;
}

export interface UseGridDataResult<TData> {
  /** The data source to pass to <Grid dataSource={...} />. */
  dataSource: MutableDataSource<TData>;
  /** Update a single row by ID with partial data. */
  updateRow: (id: RowId, data: Partial<TData>) => void;
  /** Add rows to the data source. */
  addRows: (rows: TData[]) => void;
  /** Remove rows by ID. */
  removeRows: (ids: RowId[]) => void;
  /** Update a single cell value. */
  updateCell: (id: RowId, field: string, value: CellValue) => void;
  /** Clear all data from the data source. */
  clear: () => void;
  /** Get a row by its ID. */
  getRowById: (id: RowId) => TData | undefined;
  /** Get the current total row count. */
  getTotalRowCount: () => number;
  /** Force immediate processing of queued transactions. */
  flushTransactions: () => Promise<void>;
}

/**
 * React hook for efficient grid data mutations.
 *
 * Wraps `createMutableClientDataSource` to provide a simple API for
 * updating grid data without triggering full pipeline rebuilds.
 *
 * @example
 * ```tsx
 * const { dataSource, updateRow, addRows } = useGridData(initialData, {
 *   getRowId: (row) => row.id,
 * });
 *
 * return <Grid dataSource={dataSource} columns={columns} rowHeight={36} />;
 * ```
 */
export const useGridData = <TData extends Row = Row>(
  initialData: TData[],
  options: UseGridDataOptions<TData>,
): UseGridDataResult<TData> => {
  const ds = useMemo(
    () =>
      createMutableClientDataSource<TData>(initialData, {
        getRowId: options.getRowId,
        debounceMs: options.debounceMs ?? 0,
        useWorker: options.useWorker,
        parallelSort: options.parallelSort,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return {
    dataSource: ds,
    updateRow: ds.updateRow,
    addRows: ds.addRows,
    removeRows: ds.removeRows,
    updateCell: ds.updateCell,
    clear: ds.clear,
    getRowById: ds.getRowById,
    getTotalRowCount: ds.getTotalRowCount,
    flushTransactions: ds.flushTransactions,
  };
};
