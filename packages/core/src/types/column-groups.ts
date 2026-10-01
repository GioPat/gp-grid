// packages/core/src/types/column-groups.ts
// Nested column-group descriptors (PRD 007 D6): the caller's header hierarchy
// over leaf column ids, its budgets, the outcome of a guarded column change,
// and the header runs a layout gives it.

import type { ColumnRegion } from "./geometry";

/** A header group over its ordered children. The grid never mutates it. */
export interface ColumnGroupDefinition {
  /** Stable id, distinct from every other group id and every column id. */
  groupId: string;
  /** Header text. Default: `groupId`. */
  headerName?: string;
  /** Whether the header text wraps inside its band. Default: false. */
  wrapHeaderText?: boolean;
  /** Renderer key for adapter lookup, or inline renderer function. */
  headerRenderer?: string | ((params: unknown) => unknown);
  children: readonly ColumnGroupChild[];
}

/** A nested group, or a leaf `ColumnId`. */
export type ColumnGroupChild = ColumnGroupDefinition | string;

/** Budgets of a column-group hierarchy, each a positive safe integer. Creation-only. */
export interface ColumnGroupLimits {
  /** Most groups above any group or column. Default: 64. */
  maxDepth?: number;
  /** Most groups and column references in one hierarchy. Default: 100,000. */
  maxNodes?: number;
  /** Most header runs across every band and region. Default: 100,000. */
  maxFragments?: number;
}

export type ColumnSchemaErrorCode =
  | "cycle"
  | "duplicateGroup"
  | "repeatedLeaf"
  | "unknownLeaf"
  | "missingLeaf"
  | "multipleParents"
  | "idCollision"
  | "malformed"
  | "limit";

/** The command a rejected column change came from. */
export type ColumnSchemaErrorSource = "groups" | "move" | "pin" | "state";

/** Why a column change was rejected. The previous schema and layout stay. */
export interface ColumnSchemaError {
  readonly code: ColumnSchemaErrorCode;
  readonly source: ColumnSchemaErrorSource;
  /** The group or column id the error names. */
  readonly id?: string;
  /** The budget a `limit` error exceeded. */
  readonly limit?: keyof ColumnGroupLimits;
  /** `labels.columnSchemaErrors[code]` formatted with `{id}` and `{limit}`. */
  readonly message: string;
}

export type ColumnSchemaResult =
  | { readonly status: "applied" | "unchanged" }
  | { readonly status: "rejected"; readonly error: ColumnSchemaError };

/**
 * A maximal contiguous set of displayed leaves under one group, in one band
 * and one admitted region (D7).
 */
export interface HeaderRun {
  readonly groupId: string;
  /** The group's depth, which is the band it occupies. */
  readonly band: number;
  readonly region: ColumnRegion;
  /** Position among the group's runs in this region, in display order. */
  readonly runIndex: number;
  /** Index of the first leaf in `ColumnLayoutSnapshot.columns`. */
  readonly firstDisplayIndex: number;
  readonly leafCount: number;
  /** Inline offset of the first leaf inside its region container. */
  readonly regionOffset: number;
  /** Displayed width of the leaves together. */
  readonly width: number;
}

/** A rendered run. `fragmentId` is `<groupId>:<region>:<runIndex>`. */
export interface HeaderFragment extends HeaderRun {
  readonly fragmentId: string;
}

/**
 * Header fragments to mount, per region: every pin run and the center runs
 * that intersect the mounted range, band by band.
 */
export interface HeaderFragments {
  readonly start: readonly HeaderFragment[];
  readonly center: readonly HeaderFragment[];
  readonly end: readonly HeaderFragment[];
}
