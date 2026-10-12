// packages/core/src/server-grouping/view-index.ts
// View indices over the root branch and the total row: rows, pages to load and id lookups.

import type { AxisBounds, GroupPathStep, RowId } from "../types";
import { decodeGroupId, encodeGroupId } from "../hierarchy/group-path";
import { parsePendingId, type Branch, type OrdinalRef } from "./branch";

export type GrandTotalPlacement = "top" | "bottom";

export type ViewRowRef<TData> = { readonly kind: "total" } | ({ readonly kind: "ordinal" } & OrdinalRef<TData>);

export interface PageRef<TData> {
  readonly branch: Branch<TData>;
  readonly page: number;
}

export interface ViewIndex<TData> {
  readonly root: Branch<TData>;
  /** The total row plus the root's rows. */
  rowCount(): number;
  /** View index of the total row, or -1. */
  totalIndex(): number;
  rowAt(viewIndex: number): ViewRowRef<TData> | undefined;
  /** -1 for an ordinal out of range or a dropped branch. */
  indexOf(branch: Branch<TData>, ordinal: number): number;
  /** One entry per page with an unloaded ordinal in `range`, in view order. */
  pagesIn(range: AxisBounds): PageRef<TData>[];
  /** The deepest located group's index; it is collapsed when the rest of the path is hidden. -1 when none is. */
  locateGroup(path: readonly GroupPathStep[]): number;
  /** The ordinal's current index, or -1 once its parent branch is gone. */
  locatePending(id: RowId): number;
  registerLeaf(id: RowId, branch: Branch<TData>, ordinal: number): void;
  /** Reads the page's nodes, so call it before `deletePage`. */
  unregisterLeaves(branch: Branch<TData>, page: number): void;
  /** A collapse drops the branch, so a loaded leaf is never hidden: -1 once its page or branch is gone. */
  locateLeaf(id: RowId): number;
}

const TOTAL_REF = { kind: "total" } as const;

/** Offset of an ordinal from its branch's first child row. */
const offsetOf = <TData>(branch: Branch<TData>, ordinal: number): number =>
  ordinal + branch.rowsBefore(branch.expandedBefore(ordinal));

/** Offset from the root's first row, or -1 once `branch` is dropped. */
const rootOffset = <TData>(root: Branch<TData>, branch: Branch<TData>, ordinal: number): number => {
  let offset = offsetOf(branch, ordinal);
  let current = branch;
  for (let link = current.parent; link !== null; link = current.parent) {
    offset += offsetOf(link.branch, link.ordinal) + 1;
    current = link.branch;
  }
  return current === root ? offset : -1;
};

/** First expanded child whose span, its row and its branch's rows, ends after `offset`. */
const entryEndingAfter = <TData>(branch: Branch<TData>, offset: number): number => {
  const { expanded } = branch;
  let low = 0;
  let high = expanded.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (expanded[mid]!.ordinal + 1 + branch.rowsBefore(mid + 1) <= offset) low = mid + 1;
    else high = mid;
  }
  return low;
};

/** Offset of the `k`-th expanded child's row; infinite past the last one. */
const entryStart = <TData>(branch: Branch<TData>, k: number): number => {
  const entry = branch.expanded[k];
  return entry === undefined ? Number.POSITIVE_INFINITY : entry.ordinal + branch.rowsBefore(k);
};

const refIn = <TData>(branch: Branch<TData>, offset: number): ViewRowRef<TData> => {
  const k = entryEndingAfter(branch, offset);
  const start = entryStart(branch, k);
  if (offset < start) return { kind: "ordinal", branch, ordinal: offset - branch.rowsBefore(k) };
  const entry = branch.expanded[k]!;
  if (offset === start) return { kind: "ordinal", branch, ordinal: entry.ordinal };
  return refIn(entry.branch, offset - start - 1);
};

/** Pages of the unloaded ordinals in the root offsets `[start, end)`. */
const collectPages = <TData>(root: Branch<TData>, start: number, end: number): PageRef<TData>[] => {
  const pages: PageRef<TData>[] = [];
  // A branch's ordinals are met in increasing order, so its pages repeat only at the last one met.
  const lastPage = new Map<Branch<TData>, number>();

  const addOrdinals = (branch: Branch<TData>, first: number, count: number) => {
    const to = branch.pageOf(first + count - 1);
    for (let page = Math.max(branch.pageOf(first), (lastPage.get(branch) ?? -1) + 1); page <= to; page++) {
      if (branch.isLoaded(page)) continue;
      pages.push({ branch, page });
    }
    lastPage.set(branch, to);
  };

  const walk = (branch: Branch<TData>, low: number, high: number): void => {
    let offset = low;
    let k = entryEndingAfter(branch, low);
    while (offset < high) {
      const entryRow = entryStart(branch, k);
      const plainEnd = Math.min(entryRow, high);
      if (offset < plainEnd) addOrdinals(branch, offset - branch.rowsBefore(k), plainEnd - offset);
      if (entryRow >= high) return;
      const entry = branch.expanded[k]!;
      if (offset <= entryRow) addOrdinals(branch, entry.ordinal, 1);
      const entryEnd = entryRow + 1 + entry.branch.rows();
      walk(entry.branch, Math.max(offset - entryRow - 1, 0), Math.min(entryEnd, high) - entryRow - 1);
      offset = entryEnd;
      k += 1;
    }
  };

  walk(root, start, end);
  return pages;
};

export const createViewIndex = <TData>(
  root: Branch<TData>,
  grandTotal: GrandTotalPlacement | undefined,
): ViewIndex<TData> => {
  const shift = grandTotal === "top" ? 1 : 0;
  const leaves = new Map<RowId, OrdinalRef<TData>>();

  const rowCount = () => root.rows() + (grandTotal === undefined ? 0 : 1);

  const totalIndex = () => {
    if (grandTotal === "top") return 0;
    return grandTotal === "bottom" ? rowCount() - 1 : -1;
  };

  const indexOf = (branch: Branch<TData>, ordinal: number) => {
    const offset = branch.hasOrdinal(ordinal) ? rootOffset(root, branch, ordinal) : -1;
    return offset < 0 ? -1 : offset + shift;
  };

  /** The live branch with this id, found through expanded children from the root. */
  const liveBranch = (id: string): Branch<TData> | undefined => {
    const path = decodeGroupId(id);
    if (path === undefined) return undefined;
    let branch: Branch<TData> | undefined = root;
    for (const depth of path.keys()) branch = branch?.childBranch(encodeGroupId(path.slice(0, depth + 1)));
    return branch;
  };

  return {
    root,
    rowCount,
    totalIndex,
    rowAt: (viewIndex) => {
      if (viewIndex >= 0 && viewIndex === totalIndex()) return TOTAL_REF;
      const offset = viewIndex - shift;
      const inside = Number.isInteger(offset) && offset >= 0 && offset < root.rows();
      return inside ? refIn(root, offset) : undefined;
    },
    indexOf,
    pagesIn: (range) => {
      const start = Math.max(range.start - shift, 0);
      const end = Math.min(range.end - shift, root.rows());
      return start < end ? collectPages(root, start, end) : [];
    },
    locateGroup: (path) => {
      let branch = root;
      let located = -1;
      for (const depth of path.keys()) {
        const ordinal = branch.groupOrdinal(encodeGroupId(path.slice(0, depth + 1)));
        if (ordinal < 0) return located;
        located = indexOf(branch, ordinal);
        const child = branch.expandedAt(ordinal);
        if (child === undefined) return located;
        branch = child;
      }
      return located;
    },
    locatePending: (id) => {
      const pending = parsePendingId(id);
      if (pending === undefined) return -1;
      const branch = liveBranch(pending.parentId);
      return branch === undefined ? -1 : indexOf(branch, pending.ordinal);
    },
    registerLeaf: (id, branch, ordinal) => {
      leaves.set(id, { branch, ordinal });
    },
    unregisterLeaves: (branch, page) => {
      for (const node of branch.pages.get(page) ?? []) {
        if (node.kind === "leaf" && leaves.get(node.id)?.branch === branch) leaves.delete(node.id);
      }
    },
    locateLeaf: (id) => {
      const entry = leaves.get(id);
      const loaded = entry !== undefined && entry.branch.nodeAt(entry.ordinal)?.id === id;
      return loaded ? indexOf(entry.branch, entry.ordinal) : -1;
    },
  };
};
