// packages/core/src/row-grouping/expansion-state.ts
// Groups toggled away from the default depth, kept by id across builds (D9).

import type { RowGroupingState, RowId } from "../types";
import type { GroupTree } from "./group-layout";
import { findGroups } from "./group-lookup";
import { createExpansion } from "./visible-rows";

export interface ExpansionState {
  /** One bit per group of `tree`: the default depth, then the toggled ids. */
  seed(tree: GroupTree): Uint8Array;
  record(id: RowId, depth: number, expanded: boolean): void;
  snapshot(): RowGroupingState;
}

export const createExpansionState = (defaultDepth: number, initial?: RowGroupingState): ExpansionState => {
  const expanded = new Set<RowId>(initial?.expanded);
  const collapsed = new Set<RowId>(initial?.collapsed);
  for (const id of collapsed) expanded.delete(id);

  return {
    seed: (tree) => {
      const bits = createExpansion(tree, defaultDepth);
      findGroups(tree, collapsed, (_, group) => {
        bits[group] = 0;
      });
      findGroups(tree, expanded, (_, group) => {
        bits[group] = 1;
      });
      return bits;
    },
    record: (id, depth, open) => {
      expanded.delete(id);
      collapsed.delete(id);
      if (open === depth < defaultDepth) return;
      (open ? expanded : collapsed).add(id);
    },
    snapshot: () => ({ expanded: [...expanded], collapsed: [...collapsed] }),
  };
};
