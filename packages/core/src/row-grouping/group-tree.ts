// packages/core/src/row-grouping/group-tree.ts
// Buckets flat rows into groups, one pass per dimension.

import type { CellValue, RowGroupDimension, RowGroupingRejection } from "../types";
import type { FlatRowSource } from "../types/row-grouping-engine";
import {
  layoutTree,
  levelsFromTree,
  type GroupTree,
  type ResolvedDimension,
  type SiblingCompare,
  type TreeLevel,
} from "./group-layout";
import { keyComparator, measureComparator, resolveLevelOrders, type LevelOrder } from "./group-order";
import { TAG_DATE, TAG_OBJECT, childGroupId, keyOf, keyTagOf, type GroupKey } from "./keys";

export type { GroupTree } from "./group-layout";

/** Aggregate reader of one measure field over a laid-out tree. */
export type MeasureValues = (tree: GroupTree, field: string) => (group: number) => CellValue;

export interface GroupOrdering {
  readonly measureFields: readonly string[];
  readonly measureValues: MeasureValues;
}

interface LevelBuild {
  parent: number[];
  tag: number[];
  key: GroupKey[];
  leafCount: number[];
}

type Buckets = Map<GroupKey, number>;

/** A date bucket map per parent beside the scalar one, so a timestamp never meets a number. */
const bucketsOf = (maps: (Buckets | undefined)[], parent: number, tag: number): Buckets => {
  const slot = tag === TAG_DATE ? parent * 2 + 1 : parent * 2;
  let buckets = maps[slot];
  if (buckets === undefined) {
    buckets = new Map();
    maps[slot] = buckets;
  }
  return buckets;
};

const addToLevel = (
  level: LevelBuild,
  maps: (Buckets | undefined)[],
  parent: number,
  tag: number,
  key: GroupKey,
): number => {
  const buckets = bucketsOf(maps, parent, tag);
  const found = buckets.get(key);
  if (found !== undefined) {
    level.leafCount[found]! += 1;
    return found;
  }
  const index = level.parent.length;
  buckets.set(key, index);
  level.parent.push(parent);
  level.tag.push(tag);
  level.key.push(key);
  level.leafCount.push(1);
  return index;
};

/** Writes each row's group at this depth into `groupOf`; `parentOf` is the depth above. */
const bucketLevel = (
  source: FlatRowSource,
  dimension: RowGroupDimension,
  parentOf: Int32Array | null,
  groupOf: Int32Array,
): TreeLevel | RowGroupingRejection => {
  const read = source.reader(dimension.field);
  const toKey = dimension.toKey;
  const level: LevelBuild = { parent: [], tag: [], key: [], leafCount: [] };
  const maps: (Buckets | undefined)[] = [];
  for (let row = 0; row < source.rowCount; row++) {
    const raw = read(row);
    const value = toKey === undefined ? raw : toKey(raw);
    const tag = keyTagOf(value);
    if (tag === TAG_OBJECT) return { reason: "object-key", field: dimension.field };
    const parent = parentOf === null ? 0 : parentOf[row]!;
    groupOf[row] = addToLevel(level, maps, parent, tag, keyOf(value, tag));
  }
  return {
    size: level.parent.length,
    parent: Int32Array.from(level.parent),
    tag: Uint8Array.from(level.tag),
    key: level.key,
    leafCount: Int32Array.from(level.leafCount),
  };
};

const bucketLevels = (
  source: FlatRowSource,
  dimensions: readonly RowGroupDimension[],
): { levels: TreeLevel[]; rowTerminal: Int32Array } | RowGroupingRejection => {
  const levels: TreeLevel[] = [];
  let parentOf: Int32Array | null = null;
  let groupOf: Int32Array = new Int32Array(source.rowCount);
  for (const dimension of dimensions) {
    const level = bucketLevel(source, dimension, parentOf, groupOf);
    if ("reason" in level) return level;
    levels.push(level);
    const spare: Int32Array = parentOf ?? new Int32Array(source.rowCount);
    parentOf = groupOf;
    groupOf = spare;
  }
  return { levels, rowTerminal: parentOf ?? groupOf };
};

const keyCompare = (levels: readonly TreeLevel[], orders: readonly LevelOrder[]): SiblingCompare => {
  const compares = levels.map((level, depth) => {
    const order = orders[depth]!;
    return keyComparator(level, order.by === "key" ? order.direction : 1);
  });
  return (depth, a, b) => compares[depth]!(a, b);
};

/** Lays the tree out again with every measure-ordered depth following its aggregate. */
const orderByMeasure = (
  tree: GroupTree,
  orders: readonly LevelOrder[],
  measureValues: MeasureValues,
): GroupTree => {
  const { levels, rowTerminal, globals } = levelsFromTree(tree);
  const compares = orders.map((order, depth) => {
    if (order.by === "key") return keyComparator(levels[depth]!, order.direction);
    const valueOf = measureValues(tree, order.field);
    const global = globals[depth]!;
    return measureComparator((local) => valueOf(global[local]!), order.direction);
  });
  return layoutTree(tree.dimensions, levels, rowTerminal, (depth, a, b) => compares[depth]!(a, b));
};

/** Groups the rows of `source`, or rejects an object key without `toKey`. */
export const buildGroupTree = (
  source: FlatRowSource,
  dimensions: readonly RowGroupDimension[],
  ordering?: GroupOrdering,
): GroupTree | RowGroupingRejection => {
  const bucketed = bucketLevels(source, dimensions);
  if ("reason" in bucketed) return bucketed;
  const resolved: ResolvedDimension[] = dimensions.map((d) => ({ id: d.id ?? d.field, field: d.field }));
  const orders = resolveLevelOrders(
    source,
    dimensions.map((d) => d.field),
    ordering?.measureFields ?? [],
  );
  const tree = layoutTree(resolved, bucketed.levels, bucketed.rowTerminal, keyCompare(bucketed.levels, orders));
  const byMeasure = orders.some((order) => order.by === "measure");
  return byMeasure && ordering !== undefined ? orderByMeasure(tree, orders, ordering.measureValues) : tree;
};

/** The group's id, built down from its nearest cached ancestor and cached. Iterative so the bundler can drop it from a flat consumer. */
export const groupIdOf = (tree: GroupTree, group: number): string => {
  const cached = tree.ids[group];
  if (cached !== undefined) return cached;
  const pending: number[] = [];
  let ancestor = group;
  while (ancestor >= 0 && tree.ids[ancestor] === undefined) {
    pending.push(ancestor);
    ancestor = tree.parent[ancestor]!;
  }
  let parentId = ancestor < 0 ? null : tree.ids[ancestor]!;
  while (pending.length > 0) {
    const current = pending.pop()!;
    const dimension = tree.dimensions[tree.depth[current]!]!;
    parentId = childGroupId(parentId, dimension.id, tree.tag[current]!, tree.key[current]!);
    tree.ids[current] = parentId;
  }
  return tree.ids[group]!;
};
