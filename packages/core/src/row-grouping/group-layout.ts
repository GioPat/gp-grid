// packages/core/src/row-grouping/group-layout.ts
// Numbers bucketed groups in display pre-order and lays their leaves out (D9).

import type { GroupKey } from "./keys";

/** The groups of one depth, by level-local index; `parent` indexes the level above. */
export interface TreeLevel {
  readonly size: number;
  readonly parent: Int32Array;
  readonly tag: Uint8Array;
  readonly key: GroupKey[];
  readonly leafCount: Int32Array;
}

export interface ResolvedDimension {
  readonly id: string;
  readonly field: string;
}

/** Groups in display pre-order; a group's descendants are `(g, end[g])`. */
export interface GroupTree {
  readonly dimensions: readonly ResolvedDimension[];
  readonly groupCount: number;
  readonly rootChildCount: number;
  readonly depth: Uint8Array;
  /** -1 under the root. */
  readonly parent: Int32Array;
  readonly end: Int32Array;
  readonly childCount: Int32Array;
  /** `[leafStart, leafEnd)` in `leafOrder`, covering every descendant. */
  readonly leafStart: Int32Array;
  readonly leafEnd: Int32Array;
  readonly tag: Uint8Array;
  readonly key: GroupKey[];
  /** Flat positions by terminal group, flat order inside each. */
  readonly leafOrder: Int32Array;
  /** Terminal group of each flat position. */
  readonly rowGroup: Int32Array;
  /** Lazy id cache, see `groupIdOf`. */
  readonly ids: (string | undefined)[];
}

/** Orders two siblings of one depth by level-local index. */
export type SiblingCompare = (depth: number, a: number, b: number) => number;

interface Cursor {
  next: Int32Array;
  leaf: Int32Array;
}

const sortLevel = (level: TreeLevel, compare: (a: number, b: number) => number): Int32Array => {
  const order = new Int32Array(level.size);
  for (let i = 0; i < level.size; i++) order[i] = i;
  const parent = level.parent;
  return order.sort((a, b) => parent[a]! - parent[b]! || compare(a, b) || a - b);
};

/** Groups in each subtree, the group included. */
const subtreeSizes = (levels: readonly TreeLevel[]): Int32Array[] => {
  const sizes = levels.map((level) => new Int32Array(level.size).fill(1));
  for (let depth = levels.length - 1; depth > 0; depth--) {
    const level = levels[depth]!;
    const own = sizes[depth]!;
    const above = sizes[depth - 1]!;
    for (let i = 0; i < level.size; i++) above[level.parent[i]!]! += own[i]!;
  }
  return sizes;
};

const emptyTree = (dimensions: readonly ResolvedDimension[], groupCount: number, rowCount: number) => ({
  dimensions,
  groupCount,
  rootChildCount: 0,
  depth: new Uint8Array(groupCount),
  parent: new Int32Array(groupCount),
  end: new Int32Array(groupCount),
  childCount: new Int32Array(groupCount),
  leafStart: new Int32Array(groupCount),
  leafEnd: new Int32Array(groupCount),
  tag: new Uint8Array(groupCount),
  key: new Array<GroupKey>(groupCount),
  leafOrder: new Int32Array(rowCount),
  rowGroup: new Int32Array(rowCount),
  ids: new Array<string | undefined>(groupCount),
});

type MutableTree = ReturnType<typeof emptyTree>;

/** Places one depth under the cursor of the depth above; returns this depth's cursor. */
const placeLevel = (
  tree: MutableTree,
  level: TreeLevel,
  depth: number,
  order: Int32Array,
  size: Int32Array,
  above: Cursor,
  aboveGlobal: Int32Array | null,
): { cursor: Cursor; global: Int32Array } => {
  const cursor: Cursor = { next: new Int32Array(level.size), leaf: new Int32Array(level.size) };
  const global = new Int32Array(level.size);
  for (const local of order) {
    const p = level.parent[local]!;
    const id = above.next[p]!;
    const leafStart = above.leaf[p]!;
    above.next[p] = id + size[local]!;
    above.leaf[p] = leafStart + level.leafCount[local]!;
    global[local] = id;
    cursor.next[local] = id + 1;
    cursor.leaf[local] = leafStart;
    tree.depth[id] = depth;
    tree.parent[id] = aboveGlobal === null ? -1 : aboveGlobal[p]!;
    tree.end[id] = id + size[local]!;
    tree.leafStart[id] = leafStart;
    tree.leafEnd[id] = leafStart + level.leafCount[local]!;
    tree.tag[id] = level.tag[local]!;
    tree.key[id] = level.key[local]!;
    if (aboveGlobal !== null) tree.childCount[aboveGlobal[p]!]! += 1;
  }
  return { cursor, global };
};

const fillLeaves = (tree: MutableTree, rowTerminal: Int32Array, terminalGlobal: Int32Array) => {
  const cursor = tree.leafStart.slice();
  for (let row = 0; row < rowTerminal.length; row++) {
    const group = terminalGlobal[rowTerminal[row]!]!;
    tree.rowGroup[row] = group;
    tree.leafOrder[cursor[group]!++] = row;
  }
};

/** Lays bucketed levels out in pre-order; `rowTerminal` holds each row's terminal-level index. */
export const layoutTree = (
  dimensions: readonly ResolvedDimension[],
  levels: readonly TreeLevel[],
  rowTerminal: Int32Array,
  compare: SiblingCompare,
): GroupTree => {
  const sizes = subtreeSizes(levels);
  const groupCount = levels.reduce((sum, level) => sum + level.size, 0);
  const tree = emptyTree(dimensions, groupCount, rowTerminal.length);
  let above: Cursor = { next: new Int32Array(1), leaf: new Int32Array(1) };
  let aboveGlobal: Int32Array | null = null;
  for (const [depth, level] of levels.entries()) {
    const order = sortLevel(level, (a, b) => compare(depth, a, b));
    const placed = placeLevel(tree, level, depth, order, sizes[depth]!, above, aboveGlobal);
    above = placed.cursor;
    aboveGlobal = placed.global;
  }
  tree.rootChildCount = levels[0]?.size ?? 0;
  if (aboveGlobal !== null) fillLeaves(tree, rowTerminal, aboveGlobal);
  return tree;
};

/** A laid-out tree back as levels, so it can be laid out again in another order. */
export const levelsFromTree = (
  tree: GroupTree,
): { levels: TreeLevel[]; rowTerminal: Int32Array; globals: Int32Array[] } => {
  const sizes = tree.dimensions.map(() => 0);
  for (let g = 0; g < tree.groupCount; g++) sizes[tree.depth[g]!]! += 1;
  const levels = sizes.map((size) => ({
    size,
    parent: new Int32Array(size),
    tag: new Uint8Array(size),
    key: new Array<GroupKey>(size),
    leafCount: new Int32Array(size),
  }));
  const globals = sizes.map((size) => new Int32Array(size));
  const localOf = new Int32Array(tree.groupCount);
  const filled = sizes.map(() => 0);
  for (let g = 0; g < tree.groupCount; g++) {
    const depth = tree.depth[g]!;
    const local = filled[depth]!++;
    const level = levels[depth]!;
    const p = tree.parent[g]!;
    localOf[g] = local;
    globals[depth]![local] = g;
    level.parent[local] = p < 0 ? 0 : localOf[p]!;
    level.tag[local] = tree.tag[g]!;
    level.key[local] = tree.key[g]!;
    level.leafCount[local] = tree.leafEnd[g]! - tree.leafStart[g]!;
  }
  const rowTerminal = tree.rowGroup.map((g) => localOf[g]!);
  return { levels, rowTerminal, globals };
};
