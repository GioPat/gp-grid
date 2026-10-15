// packages/core/src/pivot/pivot-view.ts
// One query's pivot: tuples, the row tree, folds, expansion bits, visible index and schema (PRD 012 D5).

import type { CellValue, PivotConfig, PivotMeasure, PivotSchema, RowGroupDimension } from "../types";
import type { FlatRowSource } from "../types/row-grouping-engine";
import { foldMeasure } from "../hierarchy/aggregators";
import { buildGroupTree, type GroupTree, type MeasureValues } from "../hierarchy/group-tree";
import { decodePivotColumnId } from "../hierarchy/pivot-ids";
import { buildPivotSchema } from "../hierarchy/pivot-schema";
import type { ExpansionState } from "../hierarchy/tree-expansion";
import { createVisibleRows, type ExpandedTree, type GrandTotalPlacement } from "../hierarchy/visible-rows";
import { encodeGroupId } from "../hierarchy/group-path";
import { foldPivotMeasure, type PivotFold } from "./pivot-fold";
import { buildPivotKeys, type PivotKeys } from "./pivot-keys";
import type { PivotOrder } from "./pivot-order";

export interface PivotSpec {
  readonly rows: readonly RowGroupDimension[];
  readonly pivots: readonly RowGroupDimension[];
  readonly measures: readonly PivotMeasure[];
  readonly domain?: PivotConfig["domain"];
  readonly rowTotals: boolean;
  readonly rowTotalsHeader?: string;
  readonly grandTotal?: GrandTotalPlacement;
  readonly maxColumns: number;
  readonly labelColumn?: PivotConfig["labelColumn"];
  readonly formatKey?: PivotConfig["formatKey"];
}

/** A generated column: a measure at a leaf tuple, or its row total at tuple -1. */
export interface PivotColumn {
  readonly measure: number;
  readonly tuple: number;
}

export type ColumnResolver = (columnId: string) => PivotColumn | null;

export interface PivotView extends ExpandedTree {
  readonly keys: PivotKeys;
  readonly folds: readonly PivotFold[];
  /** Row totals per measure, the root at `groupCount`; empty without `rowTotals`. */
  readonly totals: readonly (readonly CellValue[])[];
  readonly schema: PivotSchema;
  readonly resolve: ColumnResolver;
}

/** Decodes each column id once against this query's tuples. */
const createResolver = (spec: PivotSpec, keys: PivotKeys): ColumnResolver => {
  const cache = new Map<string, PivotColumn | null>();
  const decode = (columnId: string): PivotColumn | null => {
    const decoded = decodePivotColumnId(columnId);
    const measure = spec.measures.findIndex((candidate) => candidate.field === decoded?.measure);
    if (decoded === undefined || measure < 0) return null;
    if (decoded.path.length === 0) return spec.rowTotals ? { measure, tuple: -1 } : null;
    const tuple = keys.tupleIndex.get(encodeGroupId(decoded.path));
    return tuple === undefined ? null : { measure, tuple };
  };
  return (columnId) => {
    let column = cache.get(columnId);
    if (column === undefined) {
      column = decode(columnId);
      cache.set(columnId, column);
    }
    return column;
  };
};

/** The values of one generated column over a tree, for ordering its levels. */
const columnValuesOf =
  (source: FlatRowSource, spec: PivotSpec, keys: PivotKeys, resolve: ColumnResolver): MeasureValues =>
  (tree, columnId) => {
    const column = resolve(columnId);
    if (column === null) return () => null;
    const measure = spec.measures[column.measure]!;
    if (column.tuple < 0) {
      const values = foldMeasure(tree, source, measure).values;
      return (group) => values[group] ?? null;
    }
    const fold = foldPivotMeasure(tree, source, measure, keys.tupleOf);
    return (group) => fold.valueAt(group, column.tuple);
  };

const columnCount = (spec: PivotSpec, keys: PivotKeys): number =>
  (keys.tuples.length + (spec.rowTotals ? 1 : 0)) * spec.measures.length;

/** A terminal group has no leaves, so its bit stays 0 whatever the expansion by id says. */
const seedExpansion = (tree: GroupTree, expansion: ExpansionState): Uint8Array => {
  const expanded = expansion.seed(tree);
  const terminal = tree.dimensions.length - 1;
  for (let group = 0; group < tree.groupCount; group++) {
    if (tree.depth[group] === terminal) expanded[group] = 0;
  }
  return expanded;
};

const objectKeyError = (dimensionId: string) => `pivot key of ${dimensionId} is an object; add toKey`;

/** The view over `source`, or the message the query rejects with. */
export const buildPivotView = (
  source: FlatRowSource,
  spec: PivotSpec,
  order: PivotOrder,
  expansion: ExpansionState,
): PivotView | string => {
  const keys = buildPivotKeys(source, spec.pivots, spec.domain);
  if ("objectKey" in keys) return objectKeyError(keys.objectKey);
  const generated = columnCount(spec, keys);
  if (generated > spec.maxColumns) return `pivot generates ${generated} columns, over maxColumns ${spec.maxColumns}`;
  const resolve = createResolver(spec, keys);
  const tree = buildGroupTree(source, spec.rows, {
    measureFields: order.valueColumn === undefined ? [] : [order.valueColumn],
    measureValues: columnValuesOf(source, spec, keys, resolve),
  });
  if ("reason" in tree) {
    const dimension = spec.rows.find((candidate) => candidate.field === tree.field);
    return objectKeyError(dimension?.id ?? dimension?.field ?? String(tree.field));
  }
  const expanded = seedExpansion(tree, expansion);
  return {
    tree,
    expanded,
    visible: createVisibleRows(tree, expanded, spec.grandTotal),
    keys,
    folds: spec.measures.map((measure) => foldPivotMeasure(tree, source, measure, keys.tupleOf)),
    totals: spec.rowTotals ? spec.measures.map((measure) => foldMeasure(tree, source, measure).values) : [],
    schema: buildPivotSchema(keys.tuples, {
      measures: spec.measures,
      labelColumn: spec.labelColumn,
      rowTotals: spec.rowTotals,
      rowTotalsHeader: spec.rowTotalsHeader,
      formatKey: spec.formatKey,
    }),
    resolve,
  };
};
