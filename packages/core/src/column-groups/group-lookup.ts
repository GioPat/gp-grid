// packages/core/src/column-groups/group-lookup.ts
// Group definitions by id without a core (PRD 007 D9), for wrappers that
// render before their core exists: the server render and the first client
// frame. The walk follows `buildGroupIndex`: an explicit stack in pre-order,
// stopped past the default `maxNodes`.

import type { ColumnGroupChild, ColumnGroupDefinition } from "../types/column-groups";
import { DEFAULT_COLUMN_GROUP_LIMITS } from "../grid-core-config";
import { isChildList, isGroupDefinition } from "./group-index";

/** A group definition by `groupId`; `undefined` for an unknown id or a column id. */
export type ColumnGroupLookup = (groupId: string) => ColumnGroupDefinition | undefined;

interface LookupFrame {
  readonly children: readonly unknown[];
  cursor: number;
}

interface LookupWalk {
  readonly stack: LookupFrame[];
  readonly visited: Set<object>;
  readonly byId: Map<string, ColumnGroupDefinition>;
}

const NO_GROUPS: ColumnGroupLookup = () => undefined;

/** A group met again (a cycle or a second parent) is not walked twice. */
const visitChild = (walk: LookupWalk, child: unknown): void => {
  if (isGroupDefinition(child) && walk.visited.has(child) === false) {
    walk.visited.add(child);
    if (walk.byId.has(child.groupId) === false) walk.byId.set(child.groupId, child);
    walk.stack.push({ children: child.children, cursor: 0 });
  }
};

/** Every group by id, first in pre-order; `null` once the walk passes `maxNodes`. */
const indexGroups = (roots: readonly unknown[]): Map<string, ColumnGroupDefinition> | null => {
  const walk: LookupWalk = {
    stack: [{ children: roots, cursor: 0 }],
    visited: new Set(),
    byId: new Map(),
  };
  let visits = 0;
  let frame = walk.stack.at(-1);
  while (frame) {
    if (frame.cursor < frame.children.length) {
      visits += 1;
      if (visits > DEFAULT_COLUMN_GROUP_LIMITS.maxNodes) return null;
      visitChild(walk, frame.children[frame.cursor]);
      frame.cursor += 1;
    } else {
      walk.stack.pop();
    }
    frame = walk.stack.at(-1);
  }
  return walk.byId;
};

/**
 * Resolve `columnGroups` definitions by id without a core. Fragments exist
 * only under an adopted hierarchy, whose group ids are unique, so for every
 * rendered fragment this agrees with `core.columns.getGroup`. A hierarchy past
 * the default `maxNodes`, which the core rejects, resolves nothing.
 */
export const createColumnGroupLookup = (
  groups: readonly ColumnGroupChild[] | null | undefined,
): ColumnGroupLookup => {
  const byId = isChildList(groups) ? indexGroups(groups) : null;
  if (byId === null) return NO_GROUPS;
  return (groupId) => byId.get(groupId);
};
