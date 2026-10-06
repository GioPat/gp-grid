import { isHierarchicalRowAccess, type DataSourceResponse } from "../types";
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
