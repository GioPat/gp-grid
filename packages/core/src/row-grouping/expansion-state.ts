// packages/core/src/row-grouping/expansion-state.ts
// Groups toggled away from the expansion depth, kept by id across builds.

import type { RowGroupingState, RowId } from "../types";
import type { GroupTree } from "./group-layout";
import { findGroups } from "./group-lookup";
import { createExpansion } from "./visible-rows";

export interface ExpansionState {
  /** One bit per group of `tree`: the expansion depth, then the toggled ids. */
  seed(tree: GroupTree): Uint8Array;
  record(id: RowId, depth: number, expanded: boolean): void;
  /** Every group of `tree` at once: the depth moves and the toggled ids are forgotten. */
  setAll(tree: GroupTree, expanded: boolean): void;
  snapshot(): RowGroupingState;
}

export const createExpansionState = (configuredDepth: number, initial?: RowGroupingState): ExpansionState => {
  let depth = initial?.expandedDepth ?? configuredDepth;
  const expanded = new Set<RowId>(initial?.expanded);
  const collapsed = new Set<RowId>(initial?.collapsed);
  for (const id of collapsed) expanded.delete(id);

  return {
    seed: (tree) => {
      const bits = createExpansion(tree, depth);
      findGroups(tree, collapsed, (_, group) => {
        bits[group] = 0;
      });
      findGroups(tree, expanded, (_, group) => {
        bits[group] = 1;
      });
      return bits;
    },
    record: (id, groupDepth, open) => {
      expanded.delete(id);
      collapsed.delete(id);
      const openByDefault = groupDepth < depth;
      if (open === openByDefault) return;
      (open ? expanded : collapsed).add(id);
    },
    setAll: (tree, open) => {
      depth = open ? tree.dimensions.length : 0;
      expanded.clear();
      collapsed.clear();
    },
    snapshot: () => ({
      expanded: [...expanded],
      collapsed: [...collapsed],
      ...(depth !== configuredDepth && { expandedDepth: depth }),
    }),
  };
};
