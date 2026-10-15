// packages/core/src/pivot/pivot-keys.ts
// The pivot key tree over the flat rows: tuples per parent, domains, pruning and each row's leaf tuple (PRD 012 D5).

import type { CellValue, GroupPathStep, RowGroupDimension } from "../types";
import type { FlatRowSource } from "../types/row-grouping-engine";
import { compareTagged } from "../hierarchy/group-order";
import { encodeGroupId } from "../hierarchy/group-path";
import { TAG_DATE, TAG_NAMES, TAG_OBJECT, keyOf, keyTagOf, type GroupKey } from "../hierarchy/keys";

export interface PivotKeys {
  /** Leaf tuples in column order. */
  readonly tuples: GroupPathStep[][];
  /** Leaf tuple of each flat row, -1 when a key is outside a domain. */
  readonly tupleOf: Int32Array;
  /** Leaf tuple number by the group id of its path. */
  readonly tupleIndex: ReadonlyMap<string, number>;
}

export type PivotKeysResult = PivotKeys | { objectKey: string };

/** One pivot dimension's nodes; `children` indexes this level by node of the level above. */
interface KeyLevel {
  readonly dimensionId: string;
  readonly tag: number[];
  readonly key: GroupKey[];
  readonly children: number[][];
}

type Lookup = (Map<GroupKey, number> | undefined)[];

/** A date key map per parent beside the scalar one, so a timestamp never meets a number. */
const slotOf = (parent: number, tag: number): number => (tag === TAG_DATE ? parent * 2 + 1 : parent * 2);

const mapAt = (lookup: Lookup, slot: number): Map<GroupKey, number> => {
  let map = lookup[slot];
  if (map === undefined) {
    map = new Map();
    lookup[slot] = map;
  }
  return map;
};

const newLevel = (dimensionId: string, parentCount: number): KeyLevel => ({
  dimensionId,
  tag: [],
  key: [],
  children: Array.from({ length: parentCount }, () => []),
});

const addNode = (level: KeyLevel, parent: number, tag: number, key: GroupKey): number => {
  const node = level.tag.length;
  level.tag.push(tag);
  level.key.push(key);
  level.children[parent]!.push(node);
  return node;
};

/** The dimension's key of a value, or `undefined` for an object. */
const readKey = (dimension: RowGroupDimension, raw: CellValue): [number, GroupKey] | undefined => {
  const value = dimension.toKey === undefined ? raw : dimension.toKey(raw);
  const tag = keyTagOf(value);
  return tag === TAG_OBJECT ? undefined : [tag, keyOf(value, tag)];
};

const dataLevel = (
  source: FlatRowSource,
  dimension: RowGroupDimension,
  parentCount: number,
  nodeOf: Int32Array,
): KeyLevel | undefined => {
  const level = newLevel(dimension.id ?? dimension.field, parentCount);
  const lookup: Lookup = [];
  const read = source.reader(dimension.field);
  for (let row = 0; row < source.rowCount; row++) {
    const parent = nodeOf[row]!;
    if (parent < 0) continue;
    const found = readKey(dimension, read(row));
    if (found === undefined) return undefined;
    const map = mapAt(lookup, slotOf(parent, found[0]));
    let node = map.get(found[1]);
    if (node === undefined) {
      node = addNode(level, parent, found[0], found[1]);
      map.set(found[1], node);
    }
    nodeOf[row] = node;
  }
  for (const siblings of level.children) {
    siblings.sort((a, b) => compareTagged(level.tag[a]!, level.key[a]!, level.tag[b]!, level.key[b]!));
  }
  return level;
};

const domainLevel = (
  source: FlatRowSource,
  dimension: RowGroupDimension,
  domain: readonly CellValue[],
  parentCount: number,
  nodeOf: Int32Array,
): KeyLevel | undefined => {
  const position: Lookup = [];
  const tags: number[] = [];
  const keys: GroupKey[] = [];
  for (const value of domain) {
    const tag = keyTagOf(value);
    const key = keyOf(value, tag);
    const map = mapAt(position, slotOf(0, tag));
    if (map.has(key)) continue;
    map.set(key, tags.length);
    tags.push(tag);
    keys.push(key);
  }
  const level = newLevel(dimension.id ?? dimension.field, parentCount);
  for (let parent = 0; parent < parentCount; parent++) {
    for (const [at, tag] of tags.entries()) addNode(level, parent, tag, keys[at]!);
  }
  const read = source.reader(dimension.field);
  for (let row = 0; row < source.rowCount; row++) {
    const parent = nodeOf[row]!;
    if (parent < 0) continue;
    const found = readKey(dimension, read(row));
    if (found === undefined) return undefined;
    const at = position[slotOf(0, found[0])]?.get(found[1]);
    nodeOf[row] = at === undefined ? -1 : parent * tags.length + at;
  }
  return level;
};

/** Per level, whether a node has a leaf below it; leaves always do. */
const aliveNodes = (levels: readonly KeyLevel[]): Uint8Array[] => {
  const alive = levels.map((level) => new Uint8Array(level.tag.length));
  alive.at(-1)!.fill(1);
  for (let depth = levels.length - 2; depth >= 0; depth--) {
    const below = alive[depth + 1]!;
    const children = levels[depth + 1]!.children;
    for (const [node, siblings] of children.entries()) {
      alive[depth]![node] = siblings.some((child) => below[child] === 1) ? 1 : 0;
    }
  }
  return alive;
};

interface Collect {
  readonly levels: readonly KeyLevel[];
  readonly alive: readonly Uint8Array[];
  readonly tuples: GroupPathStep[][];
  readonly leafNumber: Int32Array;
}

const collect = (state: Collect, depth: number, node: number, path: readonly GroupPathStep[]): void => {
  const level = state.levels[depth]!;
  const last = depth === state.levels.length - 1;
  for (const child of level.children[node]!) {
    if (state.alive[depth]![child] === 0) continue;
    const step: GroupPathStep = [level.dimensionId, TAG_NAMES[level.tag[child]!]!, level.key[child]!];
    if (last) {
      state.leafNumber[child] = state.tuples.length;
      state.tuples.push([...path, step]);
    } else {
      collect(state, depth + 1, child, [...path, step]);
    }
  }
};

/** The leaf tuples of `source`'s rows over `pivots`, or the id of a dimension that read an object key. */
export const buildPivotKeys = (
  source: FlatRowSource,
  pivots: readonly RowGroupDimension[],
  domain: Readonly<Record<string, readonly CellValue[]>> = {},
): PivotKeysResult => {
  const nodeOf = new Int32Array(source.rowCount);
  const levels: KeyLevel[] = [];
  let parentCount = 1;
  for (const dimension of pivots) {
    const id = dimension.id ?? dimension.field;
    const values = Object.hasOwn(domain, id) ? domain[id] : undefined;
    const level =
      values === undefined
        ? dataLevel(source, dimension, parentCount, nodeOf)
        : domainLevel(source, dimension, values, parentCount, nodeOf);
    if (level === undefined) return { objectKey: id };
    levels.push(level);
    parentCount = level.tag.length;
  }
  const state: Collect = { levels, alive: aliveNodes(levels), tuples: [], leafNumber: new Int32Array(parentCount) };
  collect(state, 0, 0, []);
  const tupleOf = nodeOf.map((node) => (node < 0 ? -1 : state.leafNumber[node]!));
  const tupleIndex = new Map(state.tuples.map((tuple, index) => [encodeGroupId(tuple), index]));
  return { tuples: state.tuples, tupleOf, tupleIndex };
};
