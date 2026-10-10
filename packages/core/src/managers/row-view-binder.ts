import {
  isHierarchicalRowAccess,
  type ColumnDefinition,
  type DataSource,
  type DataSourceResponse,
  type HierarchicalRowAccess,
  type RowAccess,
  type RowGrouping,
  type RowGroupingRejection,
  type RowGroupingResult,
  type RowId,
  type SortModel,
} from "../types";
import { asRowGroupingEngine, type RowGroupingEngine, type RowGroupingHost } from "../types/row-grouping-engine";
import type { RowStore } from "./row-store";

/** What a response bound: the source's hierarchy, its scalar access, or its rows. */
export type RowViewBinding = "hierarchy" | "access" | "rows";

/**
 * Adopt a query response. A hierarchy binds directly and leaves the flat store
 * empty; scalar access leaves the row cache empty; otherwise the materialized
 * rows replace the cache.
 */
export const bindResponse = <TData>(
  store: RowStore<TData>,
  response: DataSourceResponse<TData>,
): RowViewBinding => {
  const { access } = response;
  const cachedRows = store.getCachedRows();
  cachedRows.clear();
  if (access !== undefined && isHierarchicalRowAccess<TData>(access)) {
    store.setRowAccess(null);
    store.setTotalRows(0);
    store.bindHierarchy(access);
    return "hierarchy";
  }
  store.bindHierarchy(null);
  store.setRowAccess(access ?? null);
  store.setTotalRows(response.totalRows);
  if (access !== undefined) return "access";
  response.rows.forEach((row, index) => {
    cachedRows.set(index, row);
  });
  return "rows";
};

const toEngine = (grouping: RowGrouping | null | undefined): RowGroupingEngine | null =>
  grouping == null ? null : asRowGroupingEngine(grouping);

const isShort = (response: DataSourceResponse<unknown>): boolean =>
  (response.access?.rowCount ?? response.rows.length) < response.totalRows;

export interface RowViewBinderOptions<TData> {
  rowGrouping?: RowGrouping | null;
  getSortModel: () => readonly SortModel[];
  getColumns: () => ColumnDefinition[];
  getDataSource: () => DataSource<TData>;
  getRowId?: (row: TData) => RowId;
  onRowGroupingRejected?: (rejection: RowGroupingRejection) => void;
}

/**
 * Binds responses and, with a grouping, the hierarchy the engine builds over the
 * flat rows. The binder is the grouping's host: what it sees of this grid.
 */
export class RowViewBinder<TData> implements RowGroupingHost<TData> {
  private readonly store: RowStore<TData>;
  private readonly options: RowViewBinderOptions<TData>;
  private readonly isPaginated: () => boolean;
  private grouping: RowGroupingEngine | null;
  private sourceHierarchy = false;
  private partial = false;
  readonly getRowId?: (row: TData) => RowId;
  readonly onRowGroupingRejected?: (rejection: RowGroupingRejection) => void;

  constructor(store: RowStore<TData>, options: RowViewBinderOptions<TData>, isPaginated: () => boolean) {
    this.store = store;
    this.options = options;
    this.isPaginated = isPaginated;
    this.grouping = toEngine(options.rowGrouping);
    this.getRowId = options.getRowId;
    this.onRowGroupingRejected = options.onRowGroupingRejected;
  }

  bind(response: DataSourceResponse<TData>): RowViewBinding {
    const binding = bindResponse(this.store, response);
    this.sourceHierarchy = binding === "hierarchy";
    this.partial = isShort(response);
    this.regroup();
    return binding;
  }

  /** A paginated load binds its pages elsewhere; a grouping is rejected. */
  bindPaginated(): void {
    this.regroup();
  }

  /** Release the bound hierarchy and forget the last response. */
  reset(): void {
    this.store.bindHierarchy(null);
    this.sourceHierarchy = false;
    this.partial = false;
  }

  setGrouping(next: RowGrouping | null): RowGroupingResult {
    if (next === this.grouping) return { status: "unchanged" };
    this.grouping = toEngine(next);
    const rejection = this.regroup();
    return rejection ? { status: "rejected", rejection } : { status: "applied" };
  }

  hasSourceHierarchy(): boolean {
    return this.sourceHierarchy;
  }

  isPartial(): boolean {
    return this.partial || this.isPaginated();
  }

  getSortModel(): readonly SortModel[] {
    return this.options.getSortModel();
  }

  getColumns(): readonly ColumnDefinition[] {
    return this.options.getColumns();
  }

  getDataSource(): DataSource<TData> {
    return this.options.getDataSource();
  }

  getRowAccess(): RowAccess | null {
    return this.store.getRowAccess();
  }

  getCachedRows(): ReadonlyMap<number, TData> {
    return this.store.getCachedRows();
  }

  private regroup(): RowGroupingRejection | null {
    const { grouping, store } = this;
    if (grouping === null) {
      this.unbindEngine();
      return null;
    }
    const built = grouping.regroup(this);
    if ("reason" in built) {
      this.unbindEngine();
      return built;
    }
    store.bindHierarchy(built as HierarchicalRowAccess<TData>);
    return null;
  }

  /** A source's own hierarchy stays bound. */
  private unbindEngine(): void {
    if (this.sourceHierarchy) return;
    this.store.bindHierarchy(null);
  }
}
