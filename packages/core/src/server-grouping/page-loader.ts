// packages/core/src/server-grouping/page-loader.ts
// Which pages to load, in what order and how many at once, and which to evict (PRD 009 D3).

import type { AxisBounds } from "../types";
import type { NormalizedRowCacheOptions } from "../managers/row-cache-options";
import type { Branch } from "./branch";
import type { PageRef, ViewIndex } from "./view-index";

export interface PageLoaderOptions<TData> {
  index: ViewIndex<TData>;
  cache: NormalizedRowCacheOptions;
  maxConcurrentRequests: number;
  /** Requests the page and applies it; rejects with the failure or protocol error. */
  fetch(ref: PageRef<TData>, signal: AbortSignal): Promise<void>;
  /** Turns a loaded page back into placeholders. */
  evict(ref: PageRef<TData>): void;
  /** A request of a live branch failed. */
  fail(ref: PageRef<TData>, message: string): void;
}

export interface PageLoader<TData> {
  /** The view rows about to show: their pages are required, their neighbours prefetched. */
  request(ranges: readonly AxisBounds[]): void;
  markLoaded(ref: PageRef<TData>): void;
  /** Whether a response may touch the view: not released, not aborted, its branch still live. */
  isCurrent(ref: PageRef<TData>, signal: AbortSignal): boolean;
  /** Whether a current response is stored: it is still wanted or the cache has room. */
  keeps(ref: PageRef<TData>): boolean;
  evictToBudget(): void;
  /** Aborts and forgets the requests and pages of `branch` and of its expanded children. */
  dropBranch(branch: Branch<TData>): void;
  release(): void;
  loadedCount(): number;
  inFlightCount(): number;
}

interface InFlight<TData> {
  readonly ref: PageRef<TData>;
  readonly controller: AbortController;
}

interface LoadedPage<TData> {
  readonly ref: PageRef<TData>;
  /** The last request that required the page, or the one current when it loaded. */
  stamp: number;
}

type PageMap<TData> = Map<string, PageRef<TData>>;

const keyOf = <TData>({ branch, page }: PageRef<TData>): string => `${branch.id}#${page}`;

const holds = <TData>(pages: ReadonlyMap<string, PageRef<TData>>, ref: PageRef<TData>): boolean =>
  pages.get(keyOf(ref))?.branch === ref.branch;

/** A collapsed branch is detached, and so is everything below it. */
const isLive = <TData>(root: Branch<TData>, branch: Branch<TData>): boolean => {
  let current = branch;
  for (let link = current.parent; link !== null; link = current.parent) current = link.branch;
  return current === root;
};

/** Its nodes carry the counts of an expanded child's rows. */
const hasExpandedChild = <TData>(branch: Branch<TData>, page: number): boolean => {
  const first = page * branch.pageSize;
  const entry = branch.expanded[branch.expandedBefore(first)];
  return entry !== undefined && entry.ordinal < first + branch.pageSize;
};

/** Rows from `ordinal` through the end of its page or the next expanded child's row, whichever is first. */
const runLength = <TData>(branch: Branch<TData>, ordinal: number, page: number): number => {
  const pageEnd = Math.min((page + 1) * branch.pageSize, branch.childCount);
  const next = branch.expanded[branch.expandedBefore(ordinal)];
  const runEnd = next === undefined ? pageEnd : Math.min(pageEnd, next.ordinal + 1);
  return runEnd - ordinal;
};

/** Every page with an ordinal in `range`, loaded or not, so a page on screen stays required. */
const visitPagesIn = <TData>(
  index: ViewIndex<TData>,
  range: AxisBounds,
  visit: (ref: PageRef<TData>) => void,
): void => {
  const end = Math.min(range.end, index.rowCount());
  let row = Math.max(range.start, 0);
  while (row < end) {
    const at = index.rowAt(row);
    if (at?.kind === "ordinal") {
      const page = at.branch.pageOf(at.ordinal);
      visit({ branch: at.branch, page });
      row += runLength(at.branch, at.ordinal, page);
    } else {
      row += 1;
    }
  }
};

const addNeighbours = <TData>(ref: PageRef<TData>, prefetchPages: number, wanted: PageMap<TData>): void => {
  const { branch, page } = ref;
  const pageCount = Math.ceil(branch.childCount / branch.pageSize);
  for (let distance = 1; distance <= prefetchPages; distance++) {
    for (const neighbour of [page + distance, page - distance]) {
      const inside = neighbour >= 0 && neighbour < pageCount;
      const next = { branch, page: neighbour };
      if (inside && branch.isLoaded(neighbour) === false && holds(wanted, next) === false) {
        wanted.set(keyOf(next), next);
      }
    }
  }
};

/** Required pages in view order, then the wanted ones: the unloaded required pages first, then prefetch. */
const planPages = <TData>(index: ViewIndex<TData>, ranges: readonly AxisBounds[], prefetchPages: number) => {
  const required: PageMap<TData> = new Map();
  const wanted: PageMap<TData> = new Map();
  const require = (ref: PageRef<TData>) => {
    required.set(keyOf(ref), ref);
  };
  const requireRange = (range: AxisBounds) => {
    for (const ref of index.pagesIn(range)) {
      require(ref);
      wanted.set(keyOf(ref), ref);
    }
    visitPagesIn(index, range, require);
  };
  for (const range of ranges) requireRange(range);
  for (const ref of [...required.values()]) addNeighbours(ref, prefetchPages, wanted);
  return { required, wanted };
};

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const createPageLoader = <TData>(options: PageLoaderOptions<TData>): PageLoader<TData> => {
  const { index, cache, maxConcurrentRequests } = options;
  const root = index.root;
  const inFlight = new Map<string, InFlight<TData>>();
  const loaded = new Map<string, LoadedPage<TData>>();
  const failedRootPages = new Set<number>();
  let required: PageMap<TData> = new Map();
  let wanted: PageMap<TData> = new Map();
  let tick = 0;
  let released = false;

  const budget = () => Math.max(cache.maxPages, required.size);

  const loadedEntry = (ref: PageRef<TData>): LoadedPage<TData> | undefined => {
    const entry = loaded.get(keyOf(ref));
    return entry?.ref.branch === ref.branch ? entry : undefined;
  };

  const isCurrent = (ref: PageRef<TData>, signal: AbortSignal) =>
    released === false && signal.aborted === false && isLive(root, ref.branch);

  const isSettled = ({ branch, page }: PageRef<TData>) =>
    branch.isLoaded(page) || (branch === root && failedRootPages.has(page));

  const isStartable = (ref: PageRef<TData>) =>
    isSettled(ref) === false && inFlight.has(keyOf(ref)) === false && isLive(root, ref.branch);

  const start = (ref: PageRef<TData>) => {
    const key = keyOf(ref);
    const entry: InFlight<TData> = { ref, controller: new AbortController() };
    inFlight.set(key, entry);
    const { signal } = entry.controller;
    const onFailure = (error: unknown) => {
      if (ref.branch === root) failedRootPages.add(ref.page);
      if (isCurrent(ref, signal)) options.fail(ref, messageOf(error));
    };
    const settle = () => {
      if (inFlight.get(key) === entry) inFlight.delete(key);
      pump();
    };
    void options.fetch(ref, signal).catch(onFailure).finally(settle);
  };

  const pump = (): void => {
    for (const ref of wanted.values()) {
      if (released || inFlight.size >= maxConcurrentRequests) return;
      if (isStartable(ref)) start(ref);
    }
  };

  const isEvictable = ({ ref }: LoadedPage<TData>) =>
    holds(required, ref) === false && hasExpandedChild(ref.branch, ref.page) === false;

  const subtreeOf = (branch: Branch<TData>, out: Set<Branch<TData>>): Set<Branch<TData>> => {
    out.add(branch);
    for (const child of branch.expanded) subtreeOf(child.branch, out);
    return out;
  };

  const forgetPages = (branch: Branch<TData>) => {
    for (const page of branch.pages.keys()) {
      const ref = { branch, page };
      if (loadedEntry(ref) !== undefined) loaded.delete(keyOf(ref));
    }
  };

  return {
    request: (ranges) => {
      if (released) return;
      const plan = planPages(index, ranges, cache.prefetchPages);
      required = plan.required;
      wanted = plan.wanted;
      tick += 1;
      for (const ref of required.values()) {
        const entry = loadedEntry(ref);
        if (entry !== undefined) entry.stamp = tick;
      }
      pump();
    },
    markLoaded: (ref) => {
      loaded.set(keyOf(ref), { ref, stamp: tick });
    },
    isCurrent,
    keeps: (ref) => holds(wanted, ref) || loaded.size < budget(),
    evictToBudget: () => {
      const excess = loaded.size - budget();
      if (excess <= 0) return;
      const candidates = [...loaded.values()].filter(isEvictable).sort((a, b) => a.stamp - b.stamp);
      for (const { ref } of candidates.slice(0, excess)) {
        loaded.delete(keyOf(ref));
        options.evict(ref);
      }
    },
    dropBranch: (branch) => {
      const dropped = subtreeOf(branch, new Set());
      for (const member of dropped) forgetPages(member);
      for (const [key, entry] of inFlight) {
        if (dropped.has(entry.ref.branch)) {
          entry.controller.abort();
          inFlight.delete(key);
        }
      }
    },
    release: () => {
      released = true;
      for (const { controller } of inFlight.values()) controller.abort();
      inFlight.clear();
      loaded.clear();
      required = new Map();
      wanted = new Map();
    },
    loadedCount: () => loaded.size,
    inFlightCount: () => inFlight.size,
  };
};
