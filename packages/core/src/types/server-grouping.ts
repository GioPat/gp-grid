// packages/core/src/types/server-grouping.ts
// The service a server grouping source asks for group children and leaf pages.

import type { CellValue, SortModel } from "./basic";
import type { DataSourceRange } from "./data-source";
import type { FilterModel } from "./filters";

/**
 * One level of a group path, as written inside a group id: `z` null, `s` string, `n` number,
 * `b` boolean, `d` a date as its timestamp; a non-finite number is written as a string.
 */
export type GroupPathStep = readonly [
  dimensionId: string,
  tag: "z" | "s" | "n" | "b" | "d",
  key: string | number | boolean | null,
];

/** `aggregate` is a name the server understands; the grid computes nothing. */
export interface ServerGroupingSpec {
  dimensions: readonly { field: string; id?: string }[];
  measures: readonly { field: string; source?: string; aggregate: string }[];
}

/** `path` is the parent, `[]` for the root; `revision` is `null` on the root request of a new view. */
export interface ServerGroupChildrenRequest {
  revision: number | null;
  grouping: ServerGroupingSpec;
  path: readonly GroupPathStep[];
  range: DataSourceRange;
  sort?: SortModel[];
  filter?: FilterModel;
  signal?: AbortSignal;
}

/** `childCount` counts immediate children; a missing or `null` aggregate is "none", never loading. */
export interface ServerGroupNode {
  key: CellValue;
  childCount: number;
  leafCount: number;
  /** Keyed by measure field. */
  aggregates?: Record<string, CellValue>;
}

/** `children[i]` is child `range.startRow + i` of the parent, counted from 0; `totalCount` is exact. */
export interface ServerGroupChildrenResponse {
  revision: number;
  totalCount: number;
  children: readonly ServerGroupNode[];
  /** The parent's own aggregates; at the root they fill the grand total row. */
  totals?: Record<string, CellValue>;
}

/** The leaves of the terminal group at `path`. */
export interface ServerLeavesRequest {
  revision: number;
  grouping: ServerGroupingSpec;
  path: readonly GroupPathStep[];
  range: DataSourceRange;
  sort?: SortModel[];
  filter?: FilterModel;
  signal?: AbortSignal;
}

export interface ServerLeavesResponse<TData> {
  revision: number;
  totalCount: number;
  rows: readonly TData[];
}

/** `signal` is aborted when the response can no longer be used; a service may ignore it. */
export interface ServerGroupingService<TData> {
  fetchChildren(request: ServerGroupChildrenRequest): Promise<ServerGroupChildrenResponse>;
  fetchLeaves(request: ServerLeavesRequest): Promise<ServerLeavesResponse<TData>>;
}
