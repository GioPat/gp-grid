// packages/core/src/server-grouping/branch.ts
// A branch: the root or an expanded group with its paged children and expanded child branches.

import type { CellValue, GroupPathStep, RowId, ServerGroupNode } from "../types";
import { TAG_NAMES, keyOf, keyTagOf, keyValue } from "../hierarchy/keys";
import { encodeGroupId } from "../hierarchy/group-path";
import { normalizePositiveInteger } from "../utils/number-guards";

export interface GroupNode {
  readonly kind: "group";
  readonly id: string;
  readonly path: readonly GroupPathStep[];
  /** The value the group row shows; a date key is a `Date`. */
  readonly key: CellValue;
  readonly childCount: number;
  readonly leafCount: number;
  readonly aggregates: Readonly<Record<string, CellValue>>;
  /** Set while the group's branch failed to load. */
  error?: string;
}

export interface LeafNode<TData> {
  readonly kind: "leaf";
  readonly id: RowId;
  readonly record: TData;
}

export type BranchNode<TData> = GroupNode | LeafNode<TData>;

export interface ExpandedChild<TData> {
  readonly ordinal: number;
  readonly branch: Branch<TData>;
}

/** An ordinal of a branch. */
export interface OrdinalRef<TData> {
  readonly branch: Branch<TData>;
  readonly ordinal: number;
}

export interface PendingRef {
  readonly parentId: string;
  readonly ordinal: number;
}

const NO_AGGREGATES: Readonly<Record<string, CellValue>> = Object.freeze({});

/** A group node under `parentPath`; an object key that is not a `Date` throws, so check responses first. */
export const createGroupNode = (
  parentPath: readonly GroupPathStep[],
  dimensionId: string,
  node: ServerGroupNode,
): GroupNode => {
  const tag = keyTagOf(node.key);
  const name = TAG_NAMES[tag];
  if (name === undefined) throw new RangeError(`Invalid group key: ${String(node.key)}`);
  const key = keyOf(node.key, tag);
  const path: GroupPathStep[] = [...parentPath, [dimensionId, name, key]];
  return {
    kind: "group",
    id: encodeGroupId(path),
    path,
    key: keyValue(tag, key),
    childCount: node.childCount,
    leafCount: node.leafCount,
    aggregates: node.aggregates ?? NO_AGGREGATES,
  };
};

const PENDING_PATTERN = /^gp-pending:(0|[1-9]\d*)@/;

export const pendingId = (parentId: string, ordinal: number): string => `gp-pending:${ordinal}@${parentId}`;

export const parsePendingId = (id: RowId): PendingRef | undefined => {
  if (typeof id === "number") return undefined;
  const match = PENDING_PATTERN.exec(id);
  if (match === null) return undefined;
  const ordinal = Number(match[1]);
  return Number.isSafeInteger(ordinal) ? { parentId: id.slice(match[0].length), ordinal } : undefined;
};

/**
 * Page `p` holds ordinals `[p·pageSize, min((p+1)·pageSize, childCount))`. Rows count 1 per ordinal,
 * loaded or not, plus the rows of each expanded child, so only expanding and collapsing move rows.
 */
export class Branch<TData> {
  readonly path: readonly GroupPathStep[];
  readonly id: string;
  readonly childCount: number;
  readonly pageSize: number;
  readonly #pages = new Map<number, readonly BranchNode<TData>[]>();
  /** Sorted by ordinal. */
  readonly #expanded: ExpandedChild<TData>[] = [];
  readonly #expandedById = new Map<string, ExpandedChild<TData>>();
  readonly #groupOrdinals = new Map<string, number>();
  #parent: OrdinalRef<TData> | null = null;
  /** `#rowsBefore[k]`: rows of the first `k` expanded children's branches. */
  #rowsBefore: number[] | undefined;

  constructor(path: readonly GroupPathStep[], childCount: number, pageSize: number) {
    this.path = path;
    this.id = encodeGroupId(path);
    this.childCount = childCount;
    this.pageSize = normalizePositiveInteger(pageSize);
  }

  get depth(): number {
    return this.path.length;
  }

  /** `null` for the root and for a collapsed (dropped) branch. */
  get parent(): OrdinalRef<TData> | null {
    return this.#parent;
  }

  get pages(): ReadonlyMap<number, readonly BranchNode<TData>[]> {
    return this.#pages;
  }

  get expanded(): readonly ExpandedChild<TData>[] {
    return this.#expanded;
  }

  isTerminal(dimensionCount: number): boolean {
    return this.path.length === dimensionCount;
  }

  hasOrdinal(ordinal: number): boolean {
    return Number.isInteger(ordinal) && ordinal >= 0 && ordinal < this.childCount;
  }

  pageOf(ordinal: number): number {
    return Math.floor(ordinal / this.pageSize);
  }

  isLoaded(page: number): boolean {
    return this.#pages.has(page);
  }

  /** `undefined` while the ordinal's page is not loaded. */
  nodeAt(ordinal: number): BranchNode<TData> | undefined {
    return this.#pages.get(this.pageOf(ordinal))?.[ordinal % this.pageSize];
  }

  /** Ordinal of the loaded group node with this id, or -1. */
  groupOrdinal(id: string): number {
    return this.#groupOrdinals.get(id) ?? -1;
  }

  setPage(page: number, nodes: readonly BranchNode<TData>[]): void {
    const span = this.#pageSpan(page);
    if (nodes.length !== span) throw new RangeError(`Page ${page} expects ${span} nodes, got ${nodes.length}`);
    this.deletePage(page);
    this.#pages.set(page, nodes);
    const start = page * this.pageSize;
    for (const [offset, node] of nodes.entries()) {
      if (node.kind === "group") this.#groupOrdinals.set(node.id, start + offset);
    }
  }

  /** An expanded child in the page keeps its branch. */
  deletePage(page: number): void {
    const nodes = this.#pages.get(page);
    if (nodes === undefined) return;
    this.#pages.delete(page);
    for (const node of nodes) {
      if (node.kind === "group") this.#groupOrdinals.delete(node.id);
    }
  }

  /** Number of expanded children before `ordinal`. */
  expandedBefore(ordinal: number): number {
    let low = 0;
    let high = this.#expanded.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.#expanded[mid]!.ordinal < ordinal) low = mid + 1;
      else high = mid;
    }
    return low;
  }

  expandedAt(ordinal: number): Branch<TData> | undefined {
    const entry = this.#expanded[this.expandedBefore(ordinal)];
    return entry?.ordinal === ordinal ? entry.branch : undefined;
  }

  /** The expanded child branch with this id. */
  childBranch(id: string): Branch<TData> | undefined {
    return this.#expandedById.get(id)?.branch;
  }

  /** Replaces a branch already expanded at `ordinal`. */
  expandChild(ordinal: number, child: Branch<TData>): void {
    this.#checkOrdinal(ordinal);
    const index = this.expandedBefore(ordinal);
    const current = this.#expanded[index];
    const entry: ExpandedChild<TData> = { ordinal, branch: child };
    if (current?.ordinal === ordinal) {
      this.#detach(current);
      this.#expanded[index] = entry;
    } else {
      this.#expanded.splice(index, 0, entry);
    }
    child.#parent = { branch: this, ordinal };
    this.#expandedById.set(child.id, entry);
    this.#invalidate();
  }

  /** Returns the dropped branch, whose `parent` becomes `null`. */
  collapseChild(ordinal: number): Branch<TData> | undefined {
    const index = this.expandedBefore(ordinal);
    const entry = this.#expanded[index];
    if (entry?.ordinal !== ordinal) return undefined;
    this.#expanded.splice(index, 1);
    this.#detach(entry);
    this.#invalidate();
    return entry.branch;
  }

  rows(): number {
    return this.childCount + this.#prefix().at(-1)!;
  }

  /** Rows of the branches of the first `count` expanded children. */
  rowsBefore(count: number): number {
    return this.#prefix()[count]!;
  }

  #checkOrdinal(ordinal: number): void {
    if (this.hasOrdinal(ordinal)) return;
    throw new RangeError(`Invalid ordinal: ${ordinal}`);
  }

  #pageSpan(page: number): number {
    const span = Math.min(this.pageSize, this.childCount - page * this.pageSize);
    if (Number.isInteger(page) && page >= 0 && span > 0) return span;
    throw new RangeError(`Invalid page: ${page}`);
  }

  #detach(entry: ExpandedChild<TData>): void {
    entry.branch.#parent = null;
    this.#expandedById.delete(entry.branch.id);
  }

  #invalidate(): void {
    for (let branch: Branch<TData> | undefined = this; branch !== undefined; branch = branch.#parent?.branch) {
      branch.#rowsBefore = undefined;
    }
  }

  #prefix(): number[] {
    if (this.#rowsBefore === undefined) {
      const sums = [0];
      let sum = 0;
      for (const { branch } of this.#expanded) {
        sum += branch.rows();
        sums.push(sum);
      }
      this.#rowsBefore = sums;
    }
    return this.#rowsBefore;
  }
}
