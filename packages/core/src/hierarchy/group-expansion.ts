// packages/core/src/hierarchy/group-expansion.ts
// The expansion commands of an access over a group tree, shared by the local engines.

import type { RowId } from "../types";
import type { ExpansionState } from "./tree-expansion";
import { findGroup } from "./group-lookup";
import { groupIdOf } from "./group-tree";
import type { ExpandedTree } from "./visible-rows";

/** Sets one group's bit and records it by id; the caller rebuilds the visible index. */
export const setGroup = (view: ExpandedTree, expansion: ExpansionState, group: number, open: boolean): boolean => {
  const bit = open ? 1 : 0;
  if (view.expanded[group] === bit) return false;
  view.expanded[group] = bit;
  expansion.record(groupIdOf(view.tree, group), view.tree.depth[group]!, open);
  return true;
};

export const createGroupExpansion = (
  view: () => ExpandedTree,
  expansion: ExpansionState,
  isExpandable: (group: number) => boolean,
): ((ids: readonly RowId[] | null, open: boolean) => boolean) => {
  const setAll = (current: ExpandedTree, open: boolean): boolean => {
    const bit = open ? 1 : 0;
    let changed = false;
    for (const [group, value] of current.expanded.entries()) {
      if (isExpandable(group)) {
        changed = changed || value !== bit;
        current.expanded[group] = bit;
      }
    }
    expansion.setAll(current.tree, open);
    return changed;
  };

  const setEach = (current: ExpandedTree, ids: readonly RowId[], open: boolean): boolean => {
    let changed = false;
    for (const id of ids) {
      const group = findGroup(current.tree, id);
      changed = (group >= 0 && isExpandable(group) && setGroup(current, expansion, group, open)) || changed;
    }
    return changed;
  };

  return (ids, open) => {
    const current = view();
    const changed = ids === null ? setAll(current, open) : setEach(current, ids, open);
    if (changed) current.visible.rebuild();
    return changed;
  };
};
