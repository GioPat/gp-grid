// packages/core/src/types/row-groups.ts
// Hierarchical row access: the contract a grouping provider hands the grid.

import type { CellValue, RowId } from "./basic";
import type { RowAccess } from "./data-source";

export interface HierarchyRecordRow {
  kind: "record";
  id: RowId;
  depth: number;
}

export interface HierarchyGroupRow {
  kind: "group";
  id: RowId;
  depth: number;
  expanded: boolean;
  /** Direct children. */
  childCount: number;
  /** Descendant record rows. */
  leafCount: number;
  /** The dimension's field. */
  field: string;
  /** The group's key. */
  value: CellValue;
}

export interface HierarchyTotalRow {
  kind: "total";
  id: RowId;
  depth: 0;
  leafCount: number;
}

export type HierarchyRow = HierarchyRecordRow | HierarchyGroupRow | HierarchyTotalRow;

export type HierarchyRowKind = HierarchyRow["kind"];

/** One cell the grid wrote in place. */
export interface HierarchyRecordChange {
  viewRow: number;
  field: string;
}

/**
 * View rows of record, group and total kind. Every index in `[0, rowCount)`
 * is resident; `getValue` answers an aggregate, or `null`, on group and total rows.
 */
export interface HierarchicalRowAccess<TData = unknown> extends RowAccess {
  readonly hierarchical: true;
  /** Cheap; ids are unique within one hierarchy. A record's id is its source identity. */
  getRowId(viewRow: number): RowId;
  getRow(viewRow: number): HierarchyRow | undefined;
  /** View index of the row, of its nearest visible ancestor when hidden, or -1. */
  locate(id: RowId): number;
  /** `null` targets every group; returns whether the view rows changed. */
  setExpanded?(ids: readonly RowId[] | null, expanded: boolean): boolean;
  /** Source record of a record row. */
  getRecord?(viewRow: number): TData | undefined;
  /** The grid wrote these records in place; returns whether view rows moved. */
  recordsChanged?(changes: readonly HierarchyRecordChange[]): boolean;
}

export const isHierarchicalRowAccess = <TData = unknown>(
  access: RowAccess,
): access is HierarchicalRowAccess<TData> =>
  (access as { hierarchical?: unknown }).hierarchical === true;

/** Groups toggled away from the expansion depth. */
export interface RowGroupingState {
  readonly expanded: readonly RowId[];
  readonly collapsed: readonly RowId[];
  /** Set by `setExpanded(null, …)`, which replaces the configured `defaultExpandedDepth`. */
  readonly expandedDepth?: number;
}

/** One grouping level. `id`, `field` by default, names the bucketing and enters the group id. */
export interface RowGroupDimension {
  field: string;
  id?: string;
  toKey?: (value: CellValue) => string | number | boolean | null;
}

export type RowGroupBuiltInAggregate = "sum" | "count" | "avg" | "min" | "max";

/** A custom fold: every group starts from `init` and adds each of its leaves' values. */
export interface RowGroupAggregator<S = unknown> {
  init(): S;
  add(state: S, value: CellValue): S;
  result(state: S): CellValue;
  /** Folds `from` into `into`, leaving `from` intact; with it a parent combines its children's states instead of rereading their leaves. */
  merge?(into: S, from: S): S;
}

/** Group and total rows expose the result under `field`; `source`, `field` by default, is the leaf field folded. */
export interface RowGroupMeasure {
  field: string;
  source?: string;
  aggregate: RowGroupBuiltInAggregate | RowGroupAggregator;
}

export interface RowGroupingConfig {
  dimensions: readonly RowGroupDimension[];
  measures?: readonly RowGroupMeasure[];
  /** Groups above this depth start expanded; 0, the default, collapses every group. */
  defaultExpandedDepth?: number;
  grandTotal?: "top" | "bottom";
  initialState?: RowGroupingState;
}

/** A grouping configuration from `createRowGrouping`; one serves one grid. */
export interface RowGrouping {
  getState(): RowGroupingState;
}

/** `"unsupported"`: no hierarchy, a provider without `setExpanded`, or a destroyed core. */
export interface RowGroupResult {
  status: "applied" | "unchanged" | "unsupported";
}

export interface RowGroupingRejection {
  reason: "partial-source" | "hierarchical-source" | "unknown-field" | "object-key";
  field?: string;
}

/** `"rejected"` leaves the grid flat; `"unsupported"`: a destroyed core. */
export type RowGroupingResult =
  | { status: "applied" | "unchanged" | "unsupported" }
  | { status: "rejected"; rejection: RowGroupingRejection };

/** A pointer or key gesture toggled a group; commands stay silent. */
export interface RowGroupToggledEvent {
  rowId: RowId;
  expanded: boolean;
}
