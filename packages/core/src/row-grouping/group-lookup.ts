// packages/core/src/row-grouping/group-lookup.ts
// Resolves group ids against a tree, walking only the subtrees the ids name (D9).

import type { RowId } from "../types";
import type { GroupTree } from "./group-layout";
import { decodeGroupId, type GroupKey } from "./keys";

interface PathNode {
  ids: RowId[];
  /** By tag, then key. */
  children: (Map<GroupKey, PathNode> | undefined)[];
}

type Visit = (id: RowId, group: number) => void;

const newNode = (): PathNode => ({ ids: [], children: [] });

const insertPath = (root: PathNode, tree: GroupTree, id: RowId): void => {
  const path = decodeGroupId(id);
  if (path === undefined || path.length > tree.dimensions.length) return;
  let node = root;
  for (const [depth, [dimensionId, tag, key]] of path.entries()) {
    if (tree.dimensions[depth]!.id !== dimensionId) return;
    const byKey = node.children[tag] ?? new Map<GroupKey, PathNode>();
    node.children[tag] = byKey;
    const child = byKey.get(key) ?? newNode();
    byKey.set(key, child);
    node = child;
  }
  node.ids.push(id);
};

/** The siblings `[group, end)` still to match against `node`'s children. */
interface Frame {
  node: PathNode;
  group: number;
  end: number;
}

/** Pre-order over the named subtrees; an explicit stack so the bundler can drop it from a flat consumer. */
const walk = (tree: GroupTree, root: PathNode, visit: Visit): void => {
  const stack: Frame[] = [{ node: root, group: 0, end: tree.groupCount }];
  while (stack.length > 0) {
    const frame = stack.at(-1)!;
    if (frame.group >= frame.end) {
      stack.pop();
      continue;
    }
    const group = frame.group;
    const end = tree.end[group]!;
    frame.group = end;
    const child = frame.node.children[tree.tag[group]!]?.get(tree.key[group]!);
    if (child === undefined) continue;
    for (const id of child.ids) visit(id, group);
    if (child.children.length > 0) stack.push({ node: child, group: group + 1, end });
  }
};

/** Calls `visit` for every id naming a group of `tree`; other ids are skipped. */
export const findGroups = (tree: GroupTree, ids: Iterable<RowId>, visit: Visit): void => {
  const root = newNode();
  for (const id of ids) insertPath(root, tree, id);
  if (root.children.length > 0) walk(tree, root, visit);
};

/** The group `id` names, or -1. */
export const findGroup = (tree: GroupTree, id: RowId): number => {
  let found = -1;
  findGroups(tree, [id], (_, group) => {
    found = group;
  });
  return found;
};
