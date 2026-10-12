// packages/core/src/hierarchy/expansion-state.ts
// Groups toggled away from the expansion depth, kept by id across builds.

import type { RowGroupingState, RowId } from "../types";

export interface ExpansionIds {
  /** Groups at a smaller depth start expanded. */
  depth(): number;
  /** Toggled open away from the depth; disjoint from `collapsed`. */
  readonly expanded: ReadonlySet<RowId>;
  readonly collapsed: ReadonlySet<RowId>;
  record(id: RowId, depth: number, expanded: boolean): void;
  isExpanded(id: RowId, depth: number): boolean;
  /** Every group at once: the depth moves and the toggled ids are forgotten. */
  setAll(depth: number): void;
  snapshot(): RowGroupingState;
}

export const createExpansionIds = (configuredDepth: number, initial?: RowGroupingState): ExpansionIds => {
  let depth = initial?.expandedDepth ?? configuredDepth;
  const expanded = new Set<RowId>(initial?.expanded);
  const collapsed = new Set<RowId>(initial?.collapsed);
  for (const id of collapsed) expanded.delete(id);

  return {
    depth: () => depth,
    expanded,
    collapsed,
    record: (id, groupDepth, open) => {
      expanded.delete(id);
      collapsed.delete(id);
      const openByDefault = groupDepth < depth;
      if (open === openByDefault) return;
      (open ? expanded : collapsed).add(id);
    },
    isExpanded: (id, groupDepth) => {
      if (expanded.has(id)) return true;
      if (collapsed.has(id)) return false;
      return groupDepth < depth;
    },
    setAll: (next) => {
      depth = next;
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
