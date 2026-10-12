// packages/core/src/server-grouping/server-access.ts
// The view of one query: the HierarchicalRowAccess over its branches, loader and expansion (PRD 009 D2).

import type {
  CellValue,
  HierarchicalRowAccess,
  HierarchyChange,
  HierarchyGroupRow,
  HierarchyRow,
  RowId,
  ServerGroupingService,
  ServerGroupingSpec,
  ServerGroupNode,
} from "../types";
import type { NormalizedRowCacheOptions } from "../managers/row-cache-options";
import type { ExpansionIds } from "../hierarchy/expansion-state";
import { decodeGroupId } from "../hierarchy/group-path";
import { TOTAL_ROW_ID } from "../hierarchy/keys";
import { getFieldValue } from "../indexed-data-store/field-helpers";
import { parsePendingId, pendingId, type Branch, type BranchNode, type GroupNode } from "./branch";
import { createPageApplier, type PageApplier, type QueryScope } from "./page-apply";
import { createPageLoader, type PageLoader } from "./page-loader";
import { createServerExpansion, type ServerExpansion } from "./server-expansion";
import { createViewIndex, type GrandTotalPlacement, type ViewRowRef } from "./view-index";

export interface ServerViewOptions<TData> {
  service: ServerGroupingService<TData>;
  grouping: ServerGroupingSpec;
  scope: QueryScope;
  revision: number;
  /** Sized by the root response's `totalCount`; `rootChildren` is its first page. */
  root: Branch<TData>;
  rootChildren: readonly ServerGroupNode[];
  totals: Readonly<Record<string, CellValue>>;
  grandTotal?: GrandTotalPlacement;
  getRowId: (row: TData) => RowId;
  state: ExpansionIds;
  cache: NormalizedRowCacheOptions;
  maxConcurrentRequests: number;
}

/** @internal The access the source returns; `diagnostics` is for the server-grouping smoke, not the public contract. */
export interface ServerRowAccess<TData> extends HierarchicalRowAccess<TData> {
  diagnostics(): { loadedPages: number; inFlight: number };
}

type Listener = (change: HierarchyChange) => void;

/** A `"view"` change applies once: through a listener, else right after delivery. */
const createNotifier = () => {
  const listeners = new Set<{ listener: Listener }>();
  const notify = (change: HierarchyChange) => {
    for (const { listener } of listeners) listener(change);
  };
  return {
    notify,
    notifyView: (move: () => void) => {
      let pending = true;
      const apply = () => {
        if (pending) {
          pending = false;
          move();
        }
      };
      notify({ kind: "view", apply });
      apply();
    },
    subscribe: (listener: Listener) => {
      const entry = { listener };
      listeners.add(entry);
      return () => {
        listeners.delete(entry);
      };
    },
    clear: () => listeners.clear(),
  };
};

const nodeOf = <TData>(ref: ViewRowRef<TData> | undefined): BranchNode<TData> | undefined =>
  ref?.kind === "ordinal" ? ref.branch.nodeAt(ref.ordinal) : undefined;

const leafCountOf = <TData>(nodes: readonly BranchNode<TData>[]): number => {
  let count = 0;
  for (const node of nodes) count += node.kind === "group" ? node.leafCount : 0;
  return count;
};

const groupRow = <TData>(branch: Branch<TData>, ordinal: number, node: GroupNode, field: string) => {
  const row: HierarchyGroupRow = {
    kind: "group",
    id: node.id,
    depth: branch.depth,
    expanded: branch.expandedAt(ordinal) !== undefined,
    childCount: node.childCount,
    leafCount: node.leafCount,
    field,
    value: node.key,
  };
  if (node.error !== undefined) row.error = node.error;
  return row;
};

export const createServerAccess = <TData>(options: ServerViewOptions<TData>): ServerRowAccess<TData> => {
  const { root, totals, grouping, state } = options;
  const fields = grouping.dimensions.map((dimension) => dimension.field);
  const index = createViewIndex(root, options.grandTotal);
  const notifier = createNotifier();
  /** Every cell of a row reads the same ref; an expand or collapse moves rows. */
  let hit: { viewIndex: number; ref: ViewRowRef<TData> | undefined } | undefined;

  const loader: PageLoader<TData> = createPageLoader<TData>({
    index,
    cache: options.cache,
    maxConcurrentRequests: options.maxConcurrentRequests,
    fetch: (ref, signal) => applier.fetchPage(ref, signal),
    evict: (ref) => applier.evictPage(ref),
    fail: (ref, message) => applier.failPage(ref, message),
  });
  const expansion: ServerExpansion<TData> = createServerExpansion<TData>({
    index,
    loader,
    state,
    dimensionCount: fields.length,
    onChange: () => {
      hit = undefined;
    },
  });
  const applier: PageApplier<TData> = createPageApplier<TData>({
    service: options.service,
    grouping,
    scope: options.scope,
    revision: options.revision,
    getRowId: options.getRowId,
    index,
    state,
    expansion,
    loader,
    notify: notifier.notify,
    notifyView: notifier.notifyView,
  });
  applier.seedRoot(options.rootChildren);

  const rowAt = (viewIndex: number): ViewRowRef<TData> | undefined => {
    if (hit?.viewIndex === viewIndex) return hit.ref;
    const ref = index.rowAt(viewIndex);
    hit = { viewIndex, ref };
    return ref;
  };

  const rootLeafCount = () => {
    let count = 0;
    for (const nodes of root.pages.values()) count += leafCountOf(nodes);
    return count;
  };

  /** A pending row of a collapsed group answers that group. */
  const locatePending = (id: RowId, parentId: string): number => {
    const located = index.locatePending(id);
    if (located >= 0) return located;
    const parentPath = decodeGroupId(parentId);
    return parentPath === undefined ? -1 : index.locateGroup(parentPath);
  };

  const getRow = (viewIndex: number): HierarchyRow | undefined => {
    const ref = rowAt(viewIndex);
    if (ref === undefined) return undefined;
    if (ref.kind === "total") return { kind: "total", id: TOTAL_ROW_ID, depth: 0, leafCount: rootLeafCount() };
    const { branch, ordinal } = ref;
    const node = branch.nodeAt(ordinal);
    if (node?.kind === "group") return groupRow(branch, ordinal, node, fields[branch.depth]!);
    return node === undefined ? undefined : { kind: "record", id: node.id, depth: branch.depth };
  };

  const getRowId = (viewIndex: number): RowId => {
    const ref = rowAt(viewIndex);
    if (ref === undefined) return -1;
    if (ref.kind === "total") return TOTAL_ROW_ID;
    return ref.branch.nodeAt(ref.ordinal)?.id ?? pendingId(ref.branch.id, ref.ordinal);
  };

  const getValue = (viewIndex: number, field: string): CellValue => {
    const ref = rowAt(viewIndex);
    if (ref?.kind === "total") return totals[field] ?? null;
    const node = nodeOf(ref);
    if (node?.kind === "group") return node.aggregates[field] ?? null;
    return node === undefined ? null : (getFieldValue(node.record, field) ?? null);
  };

  const locate = (id: RowId): number => {
    if (id === TOTAL_ROW_ID) return index.totalIndex();
    const pending = parsePendingId(id);
    if (pending !== undefined) return locatePending(id, pending.parentId);
    const path = decodeGroupId(id);
    return path === undefined ? index.locateLeaf(id) : index.locateGroup(path);
  };

  return {
    hierarchical: true,
    revision: options.revision,
    get rowCount() {
      return index.rowCount();
    },
    getRow,
    getRowId,
    getValue,
    getRecord: (viewIndex) => {
      const node = nodeOf(rowAt(viewIndex));
      return node?.kind === "leaf" ? node.record : undefined;
    },
    locate,
    setExpanded: (ids, expanded) => expansion.setExpanded(ids, expanded),
    requestRows: (ranges) => loader.request(ranges),
    subscribe: notifier.subscribe,
    release: () => {
      loader.release();
      notifier.clear();
    },
    diagnostics: () => ({ loadedPages: loader.loadedCount(), inFlight: loader.inFlightCount() }),
  };
};
