// packages/core/src/server-grouping/page-apply.ts
// A page's request and what its response, failure or eviction does to the view (PRD 009 D3, D4).

import type {
  DataSourceRange,
  FilterModel,
  HierarchyChange,
  RowId,
  ServerGroupChildrenRequest,
  ServerGroupingService,
  ServerGroupingSpec,
  ServerGroupNode,
  ServerLeavesRequest,
  SortModel,
} from "../types";
import type { ExpansionIds } from "../hierarchy/expansion-state";
import { createGroupNode, type LeafNode } from "./branch";
import type { PageLoader } from "./page-loader";
import { checkChildren, checkLeaves } from "./protocol";
import type { ServerExpansion } from "./server-expansion";
import type { PageRef, ViewIndex } from "./view-index";

/** The sort and filter every request of one view carries. */
export interface QueryScope {
  sort?: SortModel[];
  filter?: FilterModel;
}

export interface PageApplyDeps<TData> {
  service: ServerGroupingService<TData>;
  grouping: ServerGroupingSpec;
  scope: QueryScope;
  revision: number;
  getRowId: (row: TData) => RowId;
  index: ViewIndex<TData>;
  state: ExpansionIds;
  expansion: ServerExpansion<TData>;
  loader: PageLoader<TData>;
  /** Called in a promise continuation, never inside a call into the access. */
  notify(change: HierarchyChange): void;
  /** Notifies a pending `"view"` change whose `apply()` runs `move`. */
  notifyView(move: () => void): void;
}

export interface PageApplier<TData> {
  /** Requests the page and applies its response; rejects with a failure or a protocol error. */
  fetchPage(ref: PageRef<TData>, signal: AbortSignal): Promise<void>;
  /** A group's branch collapses with `error`; a root page has no group row and notifies `"error"`. */
  failPage(ref: PageRef<TData>, message: string): void;
  evictPage(ref: PageRef<TData>): void;
  /** The root's first page, from the query that built the view: stored with no notification. */
  seedRoot(children: readonly ServerGroupNode[]): void;
}

type Apply = () => void;

const assertValid = (message: string | null): void => {
  if (message !== null) throw new Error(message);
};

const pageRange = <TData>({ branch, page }: PageRef<TData>): DataSourceRange => {
  const startRow = page * branch.pageSize;
  return { startRow, endRow: Math.min(startRow + branch.pageSize, branch.childCount) };
};

export const createPageApplier = <TData>(deps: PageApplyDeps<TData>): PageApplier<TData> => {
  const { service, grouping, scope, revision, index, state, expansion, loader } = deps;
  const dimensionCount = grouping.dimensions.length;
  const dimensionIds = grouping.dimensions.map((dimension) => dimension.id ?? dimension.field);

  /** A page holds no expanded child until it loads, so its rows are consecutive. */
  const notifyRows = (ref: PageRef<TData>) => {
    const { startRow, endRow } = pageRange(ref);
    const start = index.indexOf(ref.branch, startRow);
    const end = index.indexOf(ref.branch, endRow - 1) + 1;
    if (start >= 0 && end > start) deps.notify({ kind: "rows", start, end });
  };

  const applyLeaves = (ref: PageRef<TData>, rows: readonly TData[]) => {
    const { branch, page } = ref;
    const start = page * branch.pageSize;
    const nodes = rows.map((record): LeafNode<TData> => ({ kind: "leaf", id: deps.getRowId(record), record }));
    branch.setPage(page, nodes);
    for (const [offset, node] of nodes.entries()) index.registerLeaf(node.id, branch, start + offset);
    loader.markLoaded(ref);
    notifyRows(ref);
  };

  /** Stores the page and opens the groups the state expands; reports whether any opens, which moves rows. */
  const prepareChildren = (ref: PageRef<TData>, children: readonly ServerGroupNode[]) => {
    const { branch, page } = ref;
    const start = page * branch.pageSize;
    const nodes = children.map((child) => createGroupNode(branch.path, dimensionIds[branch.depth]!, child));
    const opened: number[] = [];
    for (const [offset, node] of nodes.entries()) {
      if (state.isExpanded(node.id, branch.depth)) opened.push(start + offset);
    }
    const store = () => {
      branch.setPage(page, nodes);
      loader.markLoaded(ref);
      for (const ordinal of opened) expansion.expand(branch, ordinal);
    };
    return { opens: opened.length > 0, store };
  };

  const applyChildren = (ref: PageRef<TData>, children: readonly ServerGroupNode[]) => {
    const { opens, store } = prepareChildren(ref, children);
    if (opens) {
      deps.notifyView(store);
      return;
    }
    store();
    notifyRows(ref);
  };

  /** Resolves to the response's apply once it passed the checks, or `undefined` when it is dropped. */
  const requestLeaves = async (ref: PageRef<TData>, signal: AbortSignal): Promise<Apply | undefined> => {
    const request: ServerLeavesRequest = {
      revision,
      grouping,
      path: ref.branch.path,
      range: pageRange(ref),
      ...scope,
      signal,
    };
    const response = await service.fetchLeaves(request);
    if (loader.isCurrent(ref, signal) === false) return undefined;
    assertValid(checkLeaves(request, response, ref.branch.childCount));
    return () => applyLeaves(ref, response.rows);
  };

  const requestChildren = async (ref: PageRef<TData>, signal: AbortSignal): Promise<Apply | undefined> => {
    const request: ServerGroupChildrenRequest = {
      revision,
      grouping,
      path: ref.branch.path,
      range: pageRange(ref),
      ...scope,
      signal,
    };
    const response = await service.fetchChildren(request);
    if (loader.isCurrent(ref, signal) === false) return undefined;
    assertValid(checkChildren(request, response, ref.branch.childCount));
    return () => applyChildren(ref, response.children);
  };

  return {
    fetchPage: async (ref, signal) => {
      const terminal = ref.branch.isTerminal(dimensionCount);
      const apply = terminal ? await requestLeaves(ref, signal) : await requestChildren(ref, signal);
      if (apply === undefined || loader.keeps(ref) === false) return;
      apply();
      loader.evictToBudget();
    },
    failPage: (ref, message) => {
      const { branch } = ref;
      if (branch === index.root) {
        deps.notify({ kind: "error", message });
        return;
      }
      const parent = branch.parent;
      if (parent === null) return;
      deps.notifyView(() => {
        if (parent.branch.expandedAt(parent.ordinal) === branch) {
          expansion.collapse(parent.branch, parent.ordinal, message);
        }
      });
    },
    evictPage: (ref) => {
      const { branch, page } = ref;
      if (branch.isTerminal(dimensionCount)) index.unregisterLeaves(branch, page);
      branch.deletePage(page);
      notifyRows(ref);
    },
    seedRoot: (children) => {
      const root = index.root;
      if (root.childCount > 0) prepareChildren({ branch: root, page: 0 }, children).store();
    },
  };
};
