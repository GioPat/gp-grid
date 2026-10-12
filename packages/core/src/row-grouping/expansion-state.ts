// packages/core/src/row-grouping/expansion-state.ts
// Seeds a group tree's expansion bits from the shared expansion by id.

import type { RowGroupingState, RowId } from "../types";
import { createExpansionIds } from "../hierarchy/expansion-state";
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
  const ids = createExpansionIds(configuredDepth, initial);

  return {
    seed: (tree) => {
      const bits = createExpansion(tree, ids.depth());
      findGroups(tree, ids.collapsed, (_, group) => {
        bits[group] = 0;
      });
      findGroups(tree, ids.expanded, (_, group) => {
        bits[group] = 1;
      });
      return bits;
    },
    record: ids.record,
    setAll: (tree, open) => ids.setAll(open ? tree.dimensions.length : 0),
    snapshot: ids.snapshot,
  };
};
