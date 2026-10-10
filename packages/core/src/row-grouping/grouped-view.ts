// packages/core/src/row-grouping/grouped-view.ts
// One build of the engine: the tree, its aggregates, expansion bits and visible index.

import type { CellValue, RowGroupDimension, RowGroupMeasure, RowGroupingRejection, RowId } from "../types";
import type { FlatRowSource } from "../types/row-grouping-engine";
import { foldMeasure, type MeasureFold } from "./aggregators";
import type { ExpansionState } from "./expansion-state";
import { buildGroupTree, type GroupTree, type MeasureValues } from "./group-tree";
import { createVisibleRows, type GrandTotalPlacement, type VisibleRows } from "./visible-rows";

export interface GroupingSpec {
  readonly dimensions: readonly RowGroupDimension[];
  readonly measures: readonly RowGroupMeasure[];
  readonly grandTotal?: GrandTotalPlacement;
}

export interface GroupedView {
  readonly tree: GroupTree;
  readonly folds: readonly MeasureFold[];
  /** By the measure's output field. */
  readonly foldOf: ReadonlyMap<string, MeasureFold>;
  readonly expanded: Uint8Array;
  readonly visible: VisibleRows;
}

const measureValuesOf =
  (source: FlatRowSource, measures: readonly RowGroupMeasure[]): MeasureValues =>
  (tree, field) => {
    const measure = measures.find((candidate) => candidate.field === field)!;
    const values: CellValue[] = foldMeasure(tree, source, measure).values;
    return (group) => values[group]!;
  };

export const buildGroupedView = (
  source: FlatRowSource,
  spec: GroupingSpec,
  expansion: ExpansionState,
): GroupedView | RowGroupingRejection => {
  const tree = buildGroupTree(source, spec.dimensions, {
    measureFields: spec.measures.map((measure) => measure.field),
    measureValues: measureValuesOf(source, spec.measures),
  });
  if ("reason" in tree) return tree;
  const folds = spec.measures.map((measure) => foldMeasure(tree, source, measure));
  const expanded = expansion.seed(tree);
  return {
    tree,
    folds,
    foldOf: new Map(folds.map((fold) => [fold.measure.field, fold])),
    expanded,
    visible: createVisibleRows(tree, expanded, spec.grandTotal),
  };
};

/** The highest collapsed group among `group` and its ancestors, or -1. */
const highestCollapsed = (view: GroupedView, group: number): number => {
  let top = -1;
  for (let g = group; g >= 0; g = view.tree.parent[g]!) {
    if (view.expanded[g] !== 1) top = g;
  }
  return top;
};

/** View index of a group, or of its highest collapsed ancestor when hidden. */
export const locateGroup = (view: GroupedView, group: number): number => {
  const hiddenBy = highestCollapsed(view, view.tree.parent[group]!);
  return view.visible.viewIndexOfGroup(hiddenBy < 0 ? group : hiddenBy);
};

/** Offset of a flat position in its terminal group's range, whose leaves ascend. */
const leafOffset = (tree: GroupTree, group: number, position: number): number => {
  let low = tree.leafStart[group]!;
  let high = tree.leafEnd[group]! - 1;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (tree.leafOrder[mid]! < position) low = mid + 1;
    else high = mid;
  }
  return low - tree.leafStart[group]!;
};

/** View index of a flat position's record, or of its highest collapsed ancestor when hidden. */
export const locatePosition = (view: GroupedView, position: number): number => {
  const group = view.tree.rowGroup[position]!;
  const hiddenBy = highestCollapsed(view, group);
  if (hiddenBy >= 0) return view.visible.viewIndexOfGroup(hiddenBy);
  return view.visible.viewIndexOfLeaf(group, leafOffset(view.tree, group, position));
};

export interface PositionFinder {
  /** Flat position of a record id, or -1. */
  find(id: RowId): number;
  /** Notes a record id the access just read, so locating it again needs no scan. */
  remember(id: RowId, position: number): void;
}

const RECENT_IDS = 512;

/**
 * A position that is its own id, or one of the last ids read, answers at once;
 * any other id scans the flat rows. A view-rows change locates the ids it read
 * just before it, so a toggle does not scan.
 */
export const createPositionFinder = (source: FlatRowSource): PositionFinder => {
  const ids = new Array<RowId | undefined>(RECENT_IDS);
  const positions = new Int32Array(RECENT_IDS);
  let next = 0;
  const holds = (position: number, id: RowId) =>
    position >= 0 && position < source.rowCount && source.getRowId(position) === id;
  const remember = (id: RowId, position: number) => {
    ids[next] = id;
    positions[next] = position;
    next = (next + 1) % RECENT_IDS;
  };
  const recent = (id: RowId): number => {
    for (let step = 1; step <= RECENT_IDS; step++) {
      const slot = (next - step + RECENT_IDS) % RECENT_IDS;
      if (ids[slot] === id && holds(positions[slot]!, id)) return positions[slot]!;
    }
    return -1;
  };
  const scan = (id: RowId): number => {
    for (let position = 0; position < source.rowCount; position++) {
      if (source.getRowId(position) === id) {
        remember(id, position);
        return position;
      }
    }
    return -1;
  };
  return {
    find: (id) => {
      if (typeof id === "number" && Number.isInteger(id) && holds(id, id)) return id;
      const found = recent(id);
      return found < 0 ? scan(id) : found;
    },
    remember,
  };
};
