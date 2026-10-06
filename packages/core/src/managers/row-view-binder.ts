import {
  isHierarchicalRowAccess,
  type DataSourceResponse,
  type HierarchicalRowAccess,
  type RowGrouping,
  type RowGroupingRejection,
  type RowGroupingResult,
  type SortModel,
} from "../types";
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

const isShort = (response: DataSourceResponse<unknown>): boolean =>
  (response.access?.rowCount ?? response.rows.length) < response.totalRows;

export interface RowViewBinderOptions {
  rowGrouping?: RowGrouping | null;
  getSortModel: () => readonly SortModel[];
  onRowGroupingRejected?: (rejection: RowGroupingRejection) => void;
}

/** Binds responses and, with a grouping, the engine's hierarchy over the flat rows (D7). */
export class RowViewBinder<TData> {
  private readonly store: RowStore<TData>;
  private readonly options: RowViewBinderOptions;
  private readonly isPaginated: () => boolean;
  private grouping: RowGrouping | null;
  private sourceHierarchy = false;
  private partial = false;
  private readonly warned = new Set<RowGroupingRejection["reason"]>();

  constructor(store: RowStore<TData>, options: RowViewBinderOptions, isPaginated: () => boolean) {
    this.store = store;
    this.options = options;
    this.isPaginated = isPaginated;
    this.grouping = options.rowGrouping ?? null;
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
    this.grouping = next;
    const rejection = this.regroup();
    return rejection ? { status: "rejected", rejection } : { status: "applied" };
  }

  private regroup(): RowGroupingRejection | null {
    const { grouping, store } = this;
    if (grouping === null) {
      this.unbindEngine();
      return null;
    }
    const built = this.check() ?? grouping.build(store.toFlatRowSource(this.options.getSortModel()));
    if ("reason" in built) {
      this.unbindEngine();
      this.reject(built);
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

  private check(): RowGroupingRejection | null {
    if (this.sourceHierarchy) return { reason: "hierarchical-source" };
    if (this.partial || this.isPaginated()) return { reason: "partial-source" };
    return null;
  }

  private reject(rejection: RowGroupingRejection): void {
    this.options.onRowGroupingRejected?.(rejection);
    if (this.warned.has(rejection.reason)) return;
    this.warned.add(rejection.reason);
    const field = rejection.field === undefined ? "" : ` (${rejection.field})`;
    console.warn(`[gp-grid] rowGrouping rejected: ${rejection.reason}${field}; the grid stays flat.`);
  }
}
