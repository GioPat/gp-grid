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

const walkChildren = (tree: GroupTree, node: PathNode, first: number, end: number, visit: Visit): void => {
  for (let group = first; group < end; group = tree.end[group]!) {
    const child = node.children[tree.tag[group]!]?.get(tree.key[group]!);
    if (child !== undefined) visitNode(tree, child, group, visit);
  }
};

const visitNode = (tree: GroupTree, node: PathNode, group: number, visit: Visit): void => {
  for (const id of node.ids) visit(id, group);
  if (node.children.length > 0) walkChildren(tree, node, group + 1, tree.end[group]!, visit);
};

/** Calls `visit` for every id naming a group of `tree`; other ids are skipped. */
export const findGroups = (tree: GroupTree, ids: Iterable<RowId>, visit: Visit): void => {
  const root = newNode();
  for (const id of ids) insertPath(root, tree, id);
  if (root.children.length > 0) walkChildren(tree, root, 0, tree.groupCount, visit);
};

/** The group `id` names, or -1. */
export const findGroup = (tree: GroupTree, id: RowId): number => {
  let found = -1;
  findGroups(tree, [id], (_, group) => {
    found = group;
  });
  return found;
};
