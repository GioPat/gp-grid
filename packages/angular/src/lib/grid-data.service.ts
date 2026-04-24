import { Injectable, InjectionToken, OnDestroy, inject } from "@angular/core";
import { createMutableClientDataSource } from "@gp-grid/core";
import type {
  CellValue,
  MutableDataSource,
  ParallelSortOptions,
  RowId,
} from "@gp-grid/core";

export interface GridDataOptions<TData> {
  /** Initial rows to seed the data source. */
  initialData: TData[];
  /** Function to extract a unique ID from each row. Required. */
  getRowId: (row: TData) => RowId;
  /** Debounce time for batching transactions in ms. Default 50. */
  debounceMs?: number;
  /** Use Web Worker for sorting large datasets (default: true) */
  useWorker?: boolean;
  /** Options for parallel sorting (only used when useWorker is true) */
  parallelSort?: ParallelSortOptions | false;
}

/**
 * Injection token holding the options passed to {@link provideGridData}.
 * Read internally by {@link GridDataService}; consumers should not depend on it directly.
 */
export const GRID_DATA_OPTIONS = new InjectionToken<GridDataOptions<unknown>>(
  "GRID_DATA_OPTIONS",
);

/**
 * Angular service mirroring the React `useGridData` hook and the Vue
 * `useGridData` composable. Wraps `createMutableClientDataSource` with
 * automatic cleanup on component destroy.
 *
 * Provided per-component via {@link provideGridData}; injected via
 * {@link injectGridData} (or `inject(GridDataService)` with a manual cast).
 */
@Injectable()
export class GridDataService<TData = unknown> implements OnDestroy {
  readonly dataSource: MutableDataSource<TData>;

  constructor() {
    const options = inject(GRID_DATA_OPTIONS) as GridDataOptions<TData>;
    this.dataSource = createMutableClientDataSource<TData>(options.initialData, {
      getRowId: options.getRowId,
      debounceMs: options.debounceMs,
      useWorker: options.useWorker,
      parallelSort: options.parallelSort,
    });
  }

  updateRow(id: RowId, data: Partial<TData>): void {
    this.dataSource.updateRow(id, data);
  }

  addRows(rows: TData[]): void {
    this.dataSource.addRows(rows);
  }

  removeRows(ids: RowId[]): void {
    this.dataSource.removeRows(ids);
  }

  updateCell(id: RowId, field: string, value: CellValue): void {
    this.dataSource.updateCell(id, field, value);
  }

  clear(): void {
    this.dataSource.clear();
  }

  getRowById(id: RowId): TData | undefined {
    return this.dataSource.getRowById(id);
  }

  getTotalRowCount(): number {
    return this.dataSource.getTotalRowCount();
  }

  flushTransactions(): Promise<void> {
    return this.dataSource.flushTransactions();
  }

  ngOnDestroy(): void {
    this.dataSource.clear();
  }
}

/**
 * Typed convenience helper for `inject(GridDataService) as GridDataService<TData>`.
 *
 * @example
 * ```ts
 * @Component({
 *   providers: [provideGridData<Person>({ getRowId: (r) => r.id, initialData: rows })],
 * })
 * export class MyGridComponent {
 *   protected readonly grid = injectGridData<Person>();
 * }
 * ```
 */
export const injectGridData = <TData>(): GridDataService<TData> =>
  inject(GridDataService) as GridDataService<TData>;
