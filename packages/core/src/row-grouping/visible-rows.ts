// packages/core/src/row-grouping/visible-rows.ts
// The visible index: visible group rows and their first view index.

import type { GroupTree } from "./group-layout";

export type GrandTotalPlacement = "top" | "bottom";

/**
 * Leaves of an expanded terminal group are the implicit run after its row,
 * so a rebuild walks visible groups only and copies no leaf.
 */
export interface VisibleRows {
  readonly rowCount: number;
  /** View index of the total row, or -1. */
  readonly totalIndex: number;
  /** Re-reads the expansion bits. */
  rebuild(): void;
  /** The group whose row is at `viewIndex`, or -1. */
  groupAt(viewIndex: number): number;
  /** The flat position of the record at `viewIndex`, or -1. */
  leafAt(viewIndex: number): number;
  /** The terminal group whose leaf run holds `viewIndex`, or -1. */
  leafGroupAt(viewIndex: number): number;
  /** View index of a group row, or -1 when hidden. */
  viewIndexOfGroup(group: number): number;
  /** View index of the `offset`-th leaf of a terminal group, or -1 when hidden. */
  viewIndexOfLeaf(group: number, offset: number): number;
}

/** One bit per group: open when its depth is below `defaultDepth`. */
export const createExpansion = (tree: GroupTree, defaultDepth: number): Uint8Array =>
  tree.depth.map((depth) => (depth < defaultDepth ? 1 : 0));

const searchFirstView = (firstView: Int32Array, count: number, viewIndex: number): number => {
  let low = 0;
  let high = count - 1;
  while (low < high) {
    const mid = (low + high + 1) >>> 1;
    if (firstView[mid]! <= viewIndex) low = mid;
    else high = mid - 1;
  }
  return low;
};

const searchGroup = (groups: Int32Array, count: number, group: number): number => {
  let low = 0;
  let high = count - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const found = groups[mid]!;
    if (found === group) return mid;
    if (found < group) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
};

export const createVisibleRows = (
  tree: GroupTree,
  expanded: Uint8Array,
  grandTotal?: GrandTotalPlacement,
): VisibleRows => {
  const groups = new Int32Array(tree.groupCount);
  const firstView = new Int32Array(tree.groupCount);
  const firstGroupView = grandTotal === "top" ? 1 : 0;
  const terminalDepth = tree.dimensions.length - 1;
  let count = 0;
  let groupsEnd = firstGroupView;
  let last = 0;

  const rebuild = () => {
    let view = firstGroupView;
    let slot = 0;
    let group = 0;
    while (group < tree.groupCount) {
      groups[slot] = group;
      firstView[slot] = view;
      slot += 1;
      view += 1;
      const open = expanded[group] === 1;
      if (open && tree.depth[group] === terminalDepth) {
        view += tree.leafEnd[group]! - tree.leafStart[group]!;
      }
      group = open ? group + 1 : tree.end[group]!;
    }
    count = slot;
    groupsEnd = view;
    last = 0;
  };

  const slotEnd = (slot: number) => (slot + 1 < count ? firstView[slot + 1]! : groupsEnd);
  const holds = (slot: number, viewIndex: number) =>
    slot < count && firstView[slot]! <= viewIndex && viewIndex < slotEnd(slot);

  /** Slot holding `viewIndex`; the last hit and its successor are tried first. */
  const slotAt = (viewIndex: number): number => {
    if (viewIndex < firstGroupView || viewIndex >= groupsEnd) return -1;
    if (holds(last, viewIndex)) return last;
    if (holds(last + 1, viewIndex)) last += 1;
    else last = searchFirstView(firstView, count, viewIndex);
    return last;
  };

  const leafOffsetAt = (slot: number, viewIndex: number) =>
    slot < 0 ? -1 : viewIndex - firstView[slot]! - 1;

  const leafGroupAt = (viewIndex: number) => {
    const slot = slotAt(viewIndex);
    return leafOffsetAt(slot, viewIndex) < 0 ? -1 : groups[slot]!;
  };

  rebuild();
  return {
    get rowCount() {
      return grandTotal === "bottom" ? groupsEnd + 1 : groupsEnd;
    },
    get totalIndex() {
      if (grandTotal === "top") return 0;
      return grandTotal === "bottom" ? groupsEnd : -1;
    },
    rebuild,
    groupAt: (viewIndex) => {
      const slot = slotAt(viewIndex);
      return slot >= 0 && firstView[slot] === viewIndex ? groups[slot]! : -1;
    },
    leafAt: (viewIndex) => {
      const slot = slotAt(viewIndex);
      const offset = leafOffsetAt(slot, viewIndex);
      return offset < 0 ? -1 : tree.leafOrder[tree.leafStart[groups[slot]!]! + offset]!;
    },
    leafGroupAt,
    viewIndexOfGroup: (group) => {
      const slot = searchGroup(groups, count, group);
      return slot < 0 ? -1 : firstView[slot]!;
    },
    viewIndexOfLeaf: (group, offset) => {
      const slot = searchGroup(groups, count, group);
      if (slot < 0 || expanded[group] !== 1) return -1;
      return firstView[slot]! + 1 + offset;
    },
  };
};
