// packages/core/src/row-grouping/aggregators.ts
// The built-in aggregators and the fold of a group's leaf range (D9).

import { compareValues } from "../indexed-data-store/sorting";
import type {
  CellValue,
  FlatRowSource,
  RowGroupAggregator,
  RowGroupBuiltInAggregate,
  RowGroupMeasure,
} from "../types";
import type { GroupTree } from "./group-layout";

interface Mean {
  sum: number;
  count: number;
}

const isFiniteNumber = (value: CellValue): value is number =>
  typeof value === "number" && Number.isFinite(value);

const addFinite = (state: Mean, value: CellValue): Mean => {
  if (isFiniteNumber(value)) {
    state.sum += value;
    state.count += 1;
  }
  return state;
};

const mergeMean = (into: Mean, from: Mean): Mean => {
  into.sum += from.sum;
  into.count += from.count;
  return into;
};

const extremum = (sign: 1 | -1): RowGroupAggregator<CellValue> => {
  const add = (best: CellValue, value: CellValue) => {
    if (value === null) return best;
    return best === null || sign * compareValues(value, best) < 0 ? value : best;
  };
  return { init: () => null, add, result: (best) => best, merge: add };
};

const BUILT_INS: Record<RowGroupBuiltInAggregate, RowGroupAggregator> = {
  sum: {
    init: (): Mean => ({ sum: 0, count: 0 }),
    add: addFinite,
    result: (state: Mean) => (state.count === 0 ? null : state.sum),
    merge: mergeMean,
  },
  avg: {
    init: (): Mean => ({ sum: 0, count: 0 }),
    add: addFinite,
    result: (state: Mean) => (state.count === 0 ? null : state.sum / state.count),
    merge: mergeMean,
  },
  count: {
    init: () => 0,
    add: (count: number, value: CellValue) => (value === null ? count : count + 1),
    result: (count: number) => count,
    merge: (into: number, from: number) => into + from,
  },
  min: extremum(1),
  max: extremum(-1),
};

export const isBuiltInAggregate = (value: unknown): value is RowGroupBuiltInAggregate =>
  typeof value === "string" && Object.hasOwn(BUILT_INS, value);

export const aggregatorOf = (measure: RowGroupMeasure): RowGroupAggregator =>
  typeof measure.aggregate === "string" ? BUILT_INS[measure.aggregate] : measure.aggregate;

type Reader = (row: number) => CellValue;

const foldState = (
  aggregator: RowGroupAggregator,
  read: Reader,
  leafOrder: Int32Array,
  start: number,
  end: number,
): unknown => {
  let state = aggregator.init();
  for (let i = start; i < end; i++) state = aggregator.add(state, read(leafOrder[i]!) ?? null);
  return state;
};

/** Folds the flat positions `leafOrder[start, end)`; a missing value reaches the aggregator as `null`. */
export const foldRange = (
  aggregator: RowGroupAggregator,
  read: Reader,
  leafOrder: Int32Array,
  start: number,
  end: number,
): CellValue => aggregator.result(foldState(aggregator, read, leafOrder, start, end));

/** One measure's results: one per group, the root at `groupCount`. */
export interface MeasureFold {
  readonly measure: RowGroupMeasure;
  readonly sourceField: string;
  readonly values: CellValue[];
  /** Refolds the given groups, `groupCount` for the root, with every ancestor of a group among them. */
  refold(groups: Iterable<number>): void;
}

/** Terminal group states in one pass over the flat rows, which visits each group's leaves in range order. */
const terminalStates = (tree: GroupTree, aggregator: RowGroupAggregator, read: Reader): unknown[] => {
  const states = new Array<unknown>(tree.groupCount + 1);
  const terminal = tree.dimensions.length - 1;
  for (let group = 0; group < tree.groupCount; group++) {
    if (tree.depth[group] === terminal) states[group] = aggregator.init();
  }
  const { rowGroup } = tree;
  for (let row = 0; row < rowGroup.length; row++) {
    const group = rowGroup[row]!;
    states[group] = aggregator.add(states[group], read(row) ?? null);
  }
  return states;
};

const leafRange = (tree: GroupTree, group: number): [number, number] =>
  group === tree.groupCount ? [0, tree.leafOrder.length] : [tree.leafStart[group]!, tree.leafEnd[group]!];

const childRange = (tree: GroupTree, group: number): [number, number] =>
  group === tree.groupCount ? [0, tree.groupCount] : [group + 1, tree.end[group]!];

const isTerminal = (tree: GroupTree, group: number) =>
  group < tree.groupCount && tree.depth[group] === tree.dimensions.length - 1;

/** A group's state: a terminal group or an aggregator without `merge` folds its range, a parent merges its children's. */
const groupState = (
  tree: GroupTree,
  aggregator: RowGroupAggregator,
  read: Reader,
  states: readonly unknown[],
  group: number,
): unknown => {
  const { merge } = aggregator;
  if (merge === undefined || isTerminal(tree, group)) {
    return foldState(aggregator, read, tree.leafOrder, ...leafRange(tree, group));
  }
  const [first, end] = childRange(tree, group);
  let state = aggregator.init();
  for (let child = first; child < end; child = tree.end[child]!) state = merge(state, states[child]);
  return state;
};

export const foldMeasure = (tree: GroupTree, source: FlatRowSource, measure: RowGroupMeasure): MeasureFold => {
  const sourceField = measure.source ?? measure.field;
  const aggregator = aggregatorOf(measure);
  const read = source.reader(sourceField);
  const states = terminalStates(tree, aggregator, read);
  for (let group = tree.groupCount - 1; group >= 0; group--) {
    if (isTerminal(tree, group) === false) states[group] = groupState(tree, aggregator, read, states, group);
  }
  states[tree.groupCount] = groupState(tree, aggregator, read, states, tree.groupCount);
  const values = states.map((state) => aggregator.result(state));
  const update = (group: number) => {
    states[group] = groupState(tree, aggregator, read, states, group);
    values[group] = aggregator.result(states[group]);
  };
  return {
    measure,
    sourceField,
    values,
    // Descendants follow their ancestors in pre-order, so descending order refolds children first; the root goes last.
    refold: (groups) => {
      const ordered = [...groups].sort((a, b) => b - a);
      if (ordered[0] === tree.groupCount) ordered.push(ordered.shift()!);
      for (const group of ordered) update(group);
    },
  };
};
