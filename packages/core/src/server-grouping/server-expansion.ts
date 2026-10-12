// packages/core/src/server-grouping/server-expansion.ts
// Expanding and collapsing loaded group nodes, recorded by id in the expansion state (PRD 009 D2, D5).

import type { RowId } from "../types";
import type { ExpansionIds } from "../hierarchy/expansion-state";
import { decodeGroupId, encodeGroupId } from "../hierarchy/group-path";
import { Branch, type BranchNode, type OrdinalRef } from "./branch";
import type { PageLoader } from "./page-loader";
import type { ViewIndex } from "./view-index";

export interface ServerExpansionDeps<TData> {
  index: ViewIndex<TData>;
  loader: Pick<PageLoader<TData>, "dropBranch">;
  state: ExpansionIds;
  dimensionCount: number;
  /** View rows may have moved. */
  onChange(): void;
}

export interface ServerExpansion<TData> {
  /** Opens the loaded group node at `ordinal`; false when there is none or it is open. */
  expand(branch: Branch<TData>, ordinal: number): boolean;
  /** Drops the expanded child at `ordinal`; `error` marks the group as failed. */
  collapse(branch: Branch<TData>, ordinal: number, error?: string): boolean;
  /** `null` targets every loaded group; returns whether view rows changed. */
  setExpanded(ids: readonly RowId[] | null, expanded: boolean): boolean;
}

export const createServerExpansion = <TData>(deps: ServerExpansionDeps<TData>): ServerExpansion<TData> => {
  const { index, loader, state, dimensionCount } = deps;
  const root = index.root;

  const expand = (branch: Branch<TData>, ordinal: number): boolean => {
    const node = branch.nodeAt(ordinal);
    if (node?.kind !== "group" || branch.expandedAt(ordinal) !== undefined) return false;
    delete node.error;
    branch.expandChild(ordinal, new Branch<TData>(node.path, node.childCount, branch.pageSize));
    state.record(node.id, branch.depth, true);
    deps.onChange();
    return true;
  };

  /** A collapse drops the branch, so its loaded leaves must stop answering `locate`. */
  const unregisterLeaves = (branch: Branch<TData>): void => {
    if (branch.isTerminal(dimensionCount)) {
      for (const page of branch.pages.keys()) index.unregisterLeaves(branch, page);
    }
    for (const child of branch.expanded) unregisterLeaves(child.branch);
  };

  const collapse = (branch: Branch<TData>, ordinal: number, error?: string): boolean => {
    const child = branch.expandedAt(ordinal);
    if (child === undefined) return false;
    unregisterLeaves(child);
    branch.collapseChild(ordinal);
    loader.dropBranch(child);
    state.record(child.id, branch.depth, false);
    const node = branch.nodeAt(ordinal);
    if (node?.kind === "group" && error !== undefined) node.error = error;
    deps.onChange();
    return true;
  };

  /** The live branch holding the loaded group `id`, and its ordinal there. */
  const ownerOf = (id: RowId): OrdinalRef<TData> | undefined => {
    const path = decodeGroupId(id);
    if (path === undefined || path.length === 0) return undefined;
    let branch: Branch<TData> | undefined = root;
    for (let depth = 1; depth < path.length && branch !== undefined; depth++) {
      branch = branch.childBranch(encodeGroupId(path.slice(0, depth)));
    }
    const ordinal = branch?.groupOrdinal(encodeGroupId(path)) ?? -1;
    return branch === undefined || ordinal < 0 ? undefined : { branch, ordinal };
  };

  const setOne = (id: RowId, expanded: boolean): boolean => {
    const owner = ownerOf(id);
    if (owner === undefined) return false;
    return expanded ? expand(owner.branch, owner.ordinal) : collapse(owner.branch, owner.ordinal);
  };

  const expandPage = (branch: Branch<TData>, start: number, nodes: readonly BranchNode<TData>[]): boolean => {
    let changed = false;
    for (const offset of nodes.keys()) changed = expand(branch, start + offset) || changed;
    return changed;
  };

  /** Opens every loaded group below `branch`; a branch opened here has no page yet. */
  const expandLoaded = (branch: Branch<TData>): boolean => {
    if (branch.isTerminal(dimensionCount)) return false;
    const open = branch.expanded.map((child) => child.branch);
    let changed = false;
    for (const [page, nodes] of branch.pages) changed = expandPage(branch, page * branch.pageSize, nodes) || changed;
    for (const child of open) changed = expandLoaded(child) || changed;
    return changed;
  };

  const collapseAll = (): boolean => {
    let changed = false;
    for (const { ordinal } of [...root.expanded]) changed = collapse(root, ordinal) || changed;
    return changed;
  };

  return {
    expand,
    collapse,
    setExpanded: (ids, expanded) => {
      if (ids === null) {
        state.setAll(expanded ? dimensionCount : 0);
        return expanded ? expandLoaded(root) : collapseAll();
      }
      let changed = false;
      for (const id of ids) changed = setOne(id, expanded) || changed;
      return changed;
    },
  };
};
