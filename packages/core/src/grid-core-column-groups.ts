// packages/core/src/grid-core-column-groups.ts
// Column-group membership for GridCore (PRD 007 D6/D7): adoption at
// construction and replacement through `columns.set` and `setGroups`. While
// groups are active the definitions reach the column model in depth-first
// leaf order, which makes it the default order, the order new leaves take on
// replacement and the order a reset restores.

import { getColumnId } from "./column-model";
import {
  buildGroupIndex,
  buildHeaderRuns,
  leafDepthOf,
  type ColumnGroupIndex,
  type ColumnSchemaFault,
} from "./column-groups";
import { createSeedColumnLayout } from "./geometry/column-layout";
import type { GridCoreConfig } from "./grid-core-config";
import { applySetColumns, type ColumnCoreDeps } from "./grid-core-columns";
import {
  COLUMN_CHANGE_UNCHANGED,
  guardColumnChange,
  rejectColumnChange,
  toColumnSchemaError,
  type ColumnGroupState,
  type ColumnGuardDeps,
} from "./grid-core-column-guard";
import type {
  ColumnDefinition,
  ColumnGroupChild,
  ColumnGroupLimits,
  ColumnSchemaResult,
} from "./types";
import type { ColumnLayoutMode } from "./types/geometry";

export interface ColumnSchemaDeps<TData> extends ColumnCoreDeps<TData>, ColumnGuardDeps {}

type HierarchyResult =
  | { readonly ok: true; readonly index: ColumnGroupIndex | null }
  | { readonly ok: false; readonly error: ColumnSchemaFault };

const indexHierarchy = (
  roots: readonly ColumnGroupChild[] | null,
  columns: readonly ColumnDefinition[],
  limits: Readonly<Required<ColumnGroupLimits>>,
): HierarchyResult => {
  if (roots === null) return { ok: true, index: null };
  return buildGroupIndex(roots, columns.map(getColumnId), limits);
};

/** `columns` in the depth-first leaf order of `index`; flat keeps the caller's. */
export const orderDepthFirst = (
  columns: readonly ColumnDefinition[],
  index: ColumnGroupIndex | null,
): ColumnDefinition[] => {
  if (index === null) return [...columns];
  const position = new Map(index.leafOrder.map((columnId, at) => [columnId, at]));
  const rank = (column: ColumnDefinition): number => position.get(getColumnId(column)) ?? 0;
  return [...columns].sort((a, b) => rank(a) - rank(b));
};

export interface AdoptedColumnGroups {
  /** The definitions the column model starts from. */
  readonly columns: ColumnDefinition[];
  readonly state: ColumnGroupState;
}

const adoptFlat = (columns: readonly ColumnDefinition[]): AdoptedColumnGroups => ({
  columns: [...columns],
  state: { index: null, columns: [...columns] },
});

const rejectInitialGroups = <TData>(
  columns: readonly ColumnDefinition[],
  config: GridCoreConfig<TData>,
  fault: ColumnSchemaFault,
): AdoptedColumnGroups => {
  const { message } = toColumnSchemaError(fault, "groups", config.labels);
  console.warn(`[gp-grid] columnGroups rejected, the grid stays flat: ${message}`);
  return adoptFlat(columns);
};

export type InitialColumnGroups =
  | { readonly ok: true; readonly columns: ColumnDefinition[]; readonly index: ColumnGroupIndex }
  | { readonly ok: false; readonly error: ColumnSchemaFault };

/**
 * The creation-time adoption rule, shared with the pre-mount seed: the index
 * and the depth-first definitions, checked against the runs of the
 * unmeasured first layout.
 */
export const resolveInitialColumnGroups = (
  columns: readonly ColumnDefinition[],
  roots: readonly ColumnGroupChild[],
  limits: Readonly<Required<ColumnGroupLimits>>,
  mode: ColumnLayoutMode,
): InitialColumnGroups => {
  const built = buildGroupIndex(roots, columns.map(getColumnId), limits);
  if (built.ok === false) return built;
  const ordered = orderDepthFirst(columns, built.index);
  const seed = createSeedColumnLayout(ordered, mode, 0, leafDepthOf(built.index));
  const runs = buildHeaderRuns(seed, built.index, limits.maxFragments);
  if (runs.ok === false) return runs;
  return { ok: true, columns: ordered, index: built.index };
};

/** Adopt `columnGroups` at construction. A rejected hierarchy leaves the grid flat. */
export const adoptInitialColumnGroups = <TData>(
  columns: readonly ColumnDefinition[],
  config: GridCoreConfig<TData>,
): AdoptedColumnGroups => {
  const roots = config.columnGroups;
  if (roots === undefined) return adoptFlat(columns);
  const { columnGroupLimits, columnLayout } = config;
  const adopted = resolveInitialColumnGroups(columns, roots, columnGroupLimits, columnLayout);
  if (adopted.ok === false) return rejectInitialGroups(columns, config, adopted.error);
  return { columns: adopted.columns, state: { index: adopted.index, columns: [...columns] } };
};

/**
 * Replace the definitions and the hierarchy together. `undefined` keeps the
 * active hierarchy and `null` makes the grid flat; either way the hierarchy
 * is validated against the new column ids before anything changes.
 */
export const applyColumnSchema = <TData>(
  deps: ColumnSchemaDeps<TData>,
  columns: readonly ColumnDefinition[],
  groups: readonly ColumnGroupChild[] | null | undefined,
): ColumnSchemaResult => {
  const roots = groups === undefined ? deps.groups.index?.roots ?? null : groups;
  const built = indexHierarchy(roots, columns, deps.config.columnGroupLimits);
  if (built.ok === false) return rejectColumnChange(deps, "groups", built.error);
  const ordered = orderDepthFirst(columns, built.index);
  const { result } = guardColumnChange(
    deps,
    "groups",
    (admit) => applySetColumns(deps, ordered, admit),
    built.index,
  );
  if (result.status === "rejected") return result;
  deps.groups.columns = [...columns];
  return result;
};

/** Replace the hierarchy over the current columns; `null` makes the grid flat. */
export const applyColumnGroups = <TData>(
  deps: ColumnSchemaDeps<TData>,
  groups: readonly ColumnGroupChild[] | null,
): ColumnSchemaResult => {
  if (groups === (deps.groups.index?.roots ?? null)) return COLUMN_CHANGE_UNCHANGED;
  return applyColumnSchema(deps, deps.groups.columns, groups);
};
