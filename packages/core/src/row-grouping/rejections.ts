// packages/core/src/row-grouping/rejections.ts
// The host-side rejections of a grouping and their report.

import type { RowGroupingRejection } from "../types";
import type { RowGroupingHost } from "../types/row-grouping-engine";

type Reason = RowGroupingRejection["reason"];

/** Once per reason per grid: a host is one grid, whatever grouping it holds. */
const warnedByHost = new WeakMap<object, Set<Reason>>();

export const checkHost = <TData>(host: RowGroupingHost<TData>): RowGroupingRejection | null => {
  if (host.hasSourceHierarchy()) return { reason: "hierarchical-source" };
  if (host.isPartial()) return { reason: "partial-source" };
  return null;
};

export const reportRejection = <TData>(host: RowGroupingHost<TData>, rejection: RowGroupingRejection): void => {
  host.onRowGroupingRejected?.(rejection);
  const warned = warnedByHost.get(host) ?? new Set<Reason>();
  warnedByHost.set(host, warned);
  if (warned.has(rejection.reason)) return;
  warned.add(rejection.reason);
  const field = rejection.field === undefined ? "" : ` (${rejection.field})`;
  console.warn(`[gp-grid] rowGrouping rejected: ${rejection.reason}${field}; the grouping is not applied.`);
};
