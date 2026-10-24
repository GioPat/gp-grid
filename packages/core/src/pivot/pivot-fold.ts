// packages/core/src/pivot/pivot-fold.ts
// One measure's sparse states by group and leaf tuple (PRD 012 D5).

import type { CellValue, RowGroupAggregator, RowGroupMeasure } from "../types";
import type { FlatRowSource } from "../types/row-grouping-engine";
import { aggregatorOf } from "../hierarchy/aggregators";
import type { GroupTree } from "../hierarchy/group-tree";

export interface PivotFold {
  /** By group, the root at `groupCount`; each map holds only the leaf tuples with rows below the group. */
  readonly states: readonly Map<number, unknown>[];
  /** The result at one group and leaf tuple, `null` for an empty intersection. */
  valueAt(group: number, tuple: number): CellValue;
}

type Reader = (row: number) => CellValue;

const addRow = (
  map: Map<number, unknown>,
  aggregator: RowGroupAggregator,
  tuple: number,
  value: CellValue,
): void => {
  const state = map.has(tuple) ? map.get(tuple) : aggregator.init();
  map.set(tuple, aggregator.add(state, value));
};

const fillTerminals = (
  tree: GroupTree,
  states: Map<number, unknown>[],
  aggregator: RowGroupAggregator,
  read: Reader,
  tupleOf: Int32Array,
): void => {
  for (let row = 0; row < tree.rowGroup.length; row++) {
    const tuple = tupleOf[row]!;
    if (tuple >= 0) addRow(states[tree.rowGroup[row]!]!, aggregator, tuple, read(row) ?? null);
  }
};

/** Children of `group`, the root's being the top groups. */
const childRange = (tree: GroupTree, group: number): [number, number] =>
  group === tree.groupCount ? [0, tree.groupCount] : [group + 1, tree.end[group]!];

const leafRange = (tree: GroupTree, group: number): [number, number] =>
  group === tree.groupCount ? [0, tree.leafOrder.length] : [tree.leafStart[group]!, tree.leafEnd[group]!];

const mergeChildren = (
  tree: GroupTree,
  states: Map<number, unknown>[],
  aggregator: RowGroupAggregator,
  merge: NonNullable<RowGroupAggregator["merge"]>,
  group: number,
): void => {
  const into = states[group]!;
  const [first, end] = childRange(tree, group);
  for (let child = first; child < end; child = tree.end[child]!) {
    for (const [tuple, state] of states[child]!) {
      into.set(tuple, merge(into.has(tuple) ? into.get(tuple) : aggregator.init(), state));
    }
  }
};

/** One pass over the group's leaf range; each row only reaches the state of its own tuple. */
const refoldRange = (
  tree: GroupTree,
  states: Map<number, unknown>[],
  aggregator: RowGroupAggregator,
  read: Reader,
  tupleOf: Int32Array,
  group: number,
): void => {
  const into = states[group]!;
  const [start, end] = leafRange(tree, group);
  for (let at = start; at < end; at++) {
    const row = tree.leafOrder[at]!;
    const tuple = tupleOf[row]!;
    if (tuple >= 0) addRow(into, aggregator, tuple, read(row) ?? null);
  }
};

export const foldPivotMeasure = (
  tree: GroupTree,
  source: FlatRowSource,
  measure: RowGroupMeasure,
  tupleOf: Int32Array,
): PivotFold => {
  const aggregator = aggregatorOf(measure);
  const read = source.reader(measure.source ?? measure.field);
  const states = Array.from({ length: tree.groupCount + 1 }, () => new Map<number, unknown>());
  fillTerminals(tree, states, aggregator, read, tupleOf);
  const terminal = tree.dimensions.length - 1;
  const fold = (group: number) => {
    if (aggregator.merge === undefined) refoldRange(tree, states, aggregator, read, tupleOf, group);
    else mergeChildren(tree, states, aggregator, aggregator.merge, group);
  };
  // Descendants follow their ancestors in pre-order, so a descending walk folds children first.
  for (let group = tree.groupCount - 1; group >= 0; group--) {
    if (tree.depth[group] !== terminal) fold(group);
  }
  fold(tree.groupCount);
  return {
    states,
    valueAt: (group, tuple) => {
      const map = states[group];
      return map?.has(tuple) ? (aggregator.result(map.get(tuple)) ?? null) : null;
    },
  };
};
