// PRD 009 D3 (AC-009-04): the page loader's order, concurrency, drop rules and eviction.

import { describe, expect, it } from "vitest";
import { Branch, createGroupNode, type BranchNode } from "../src/server-grouping/branch";
import { createPageLoader, type PageLoader } from "../src/server-grouping/page-loader";
import { createViewIndex, type PageRef } from "../src/server-grouping/view-index";
import type { GroupPathStep } from "../src/types";

type Row = { n: number };
type B = Branch<Row>;

interface Sent {
  ref: PageRef<Row>;
  signal: AbortSignal;
  done: boolean;
  settle(): void;
  fail(message: string): void;
}

interface HarnessOptions {
  childCount?: number;
  prefetchPages?: number;
  maxPages?: number;
  maxConcurrentRequests?: number;
  /** Branches above this depth hold group nodes, the others leaves. */
  dimensions?: number;
}

const PAGE_SIZE = 10;

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const step = (key: string): GroupPathStep => ["region", "s", key];

const label = ({ branch, page }: PageRef<Row>) => `${branch.depth === 0 ? "root" : String(branch.path.at(-1)![2])}#${page}`;

const nodesOf = (branch: B, page: number, groups: boolean): BranchNode<Row>[] => {
  const start = page * branch.pageSize;
  const length = Math.min(branch.pageSize, branch.childCount - start);
  return Array.from({ length }, (_, offset): BranchNode<Row> => {
    const ordinal = start + offset;
    if (groups) return createGroupNode(branch.path, "region", { key: `g${ordinal}`, childCount: 25, leafCount: 25 });
    return { kind: "leaf", id: `${branch.id}#${ordinal}`, record: { n: ordinal } };
  });
};

/** A loader whose requests settle by hand, storing their page as the applier does. */
const harness = (options: HarnessOptions = {}) => {
  const root = new Branch<Row>([], options.childCount ?? 100, PAGE_SIZE);
  const sent: Sent[] = [];
  const evicted: string[] = [];
  const failures: string[] = [];
  let peak = 0;
  const loader: PageLoader<Row> = createPageLoader<Row>({
    index: createViewIndex(root, undefined),
    cache: { pageSize: PAGE_SIZE, prefetchPages: options.prefetchPages ?? 0, maxPages: options.maxPages ?? 100 },
    maxConcurrentRequests: options.maxConcurrentRequests ?? 4,
    fetch: (ref, signal) =>
      new Promise<void>((resolve, reject) => {
        peak = Math.max(peak, loader.inFlightCount());
        const entry: Sent = {
          ref,
          signal,
          done: false,
          settle: () => {
            entry.done = true;
            if (loader.isCurrent(ref, signal) && loader.keeps(ref)) {
              ref.branch.setPage(ref.page, nodesOf(ref.branch, ref.page, ref.branch.depth < (options.dimensions ?? 0)));
              loader.markLoaded(ref);
              loader.evictToBudget();
            }
            resolve();
          },
          fail: (message) => {
            entry.done = true;
            reject(new Error(message));
          },
        };
        sent.push(entry);
      }),
    evict: (ref) => {
      ref.branch.deletePage(ref.page);
      evicted.push(label(ref));
    },
    fail: (ref, message) => failures.push(`${label(ref)} ${message}`),
  });
  const drain = async () => {
    for (let next = sent.find((entry) => entry.done === false); next; next = sent.find((entry) => entry.done === false)) {
      next.settle();
      await flush();
    }
  };
  const load = async (start: number, end: number) => {
    loader.request([{ start, end }]);
    await drain();
  };
  const labels = () => sent.map((entry) => label(entry.ref));
  return { root, loader, sent, evicted, failures, drain, load, labels, peak: () => peak };
};

describe("server grouping loader — order and concurrency (D3)", () => {
  it("starts the required pages in view order, then their neighbours", async () => {
    const h = harness({ prefetchPages: 1, maxConcurrentRequests: 1 });
    h.loader.request([{ start: 25, end: 45 }]);
    expect(h.labels()).toEqual(["root#2"]);
    await h.drain();
    expect(h.labels()).toEqual(["root#2", "root#3", "root#4", "root#1", "root#5"]);
  });

  it("keeps at most maxConcurrentRequests in flight", async () => {
    const h = harness({ maxConcurrentRequests: 2 });
    h.loader.request([{ start: 0, end: 60 }]);
    expect(h.labels()).toEqual(["root#0", "root#1"]);
    expect(h.loader.inFlightCount()).toBe(2);

    h.sent[0]!.settle();
    await flush();
    expect(h.labels()).toEqual(["root#0", "root#1", "root#2"]);
    await h.drain();
    expect(h.labels()).toHaveLength(6);
    expect(h.peak()).toBe(2);
    expect(h.loader.inFlightCount()).toBe(0);
  });

  it("never sends a page that stopped being wanted before it started", async () => {
    const h = harness({ maxConcurrentRequests: 1 });
    h.loader.request([{ start: 0, end: 40 }]);
    h.loader.request([{ start: 70, end: 90 }]);
    await h.drain();
    expect(h.labels()).toEqual(["root#0", "root#7", "root#8"]);
  });

  it("requests a page once, however often and through however many ranges it is asked for", async () => {
    const h = harness();
    h.loader.request([{ start: 0, end: 5 }]);
    h.loader.request([{ start: 3, end: 8 }, { start: 2, end: 9 }]);
    expect(h.labels()).toEqual(["root#0"]);
    await h.drain();
    h.loader.request([{ start: 0, end: 10 }]);
    expect(h.labels()).toEqual(["root#0"]);
  });
});

describe("server grouping loader — drop rules (D3)", () => {
  it("keeps a response no longer wanted only while the cache has room", async () => {
    const full = harness({ maxPages: 1 });
    await full.load(90, 100);
    full.loader.request([{ start: 0, end: 10 }]);
    full.loader.request([{ start: 50, end: 60 }]);
    await full.drain();
    expect([0, 5].map((page) => full.root.isLoaded(page))).toEqual([false, true]);
    expect(full.evicted).toEqual(["root#9"]);

    const roomy = harness({ maxPages: 5 });
    roomy.loader.request([{ start: 0, end: 10 }]);
    roomy.loader.request([{ start: 50, end: 60 }]);
    await roomy.drain();
    expect([0, 5].map((page) => roomy.root.isLoaded(page))).toEqual([true, true]);
  });

  it("drops a branch through its expanded children: aborts, forgets and stays silent", async () => {
    const h = harness({ childCount: 30, dimensions: 2 });
    await h.load(0, 10);
    const child = new Branch<Row>([step("g0")], 25, PAGE_SIZE);
    h.root.expandChild(0, child);
    await h.load(1, 3);
    const grandchild = new Branch<Row>([step("g0"), step("g0")], 25, PAGE_SIZE);
    child.expandChild(0, grandchild);
    h.loader.request([{ start: 2, end: 30 }]);
    const pending = h.sent.filter((entry) => entry.done === false);
    expect(pending.map((entry) => label(entry.ref))).toEqual(["g0#0", "g0#1", "g0#2"]);
    expect(h.loader.loadedCount()).toBe(2);

    h.root.collapseChild(0);
    h.loader.dropBranch(child);
    expect(pending.map((entry) => entry.signal.aborted)).toEqual([true, true, true]);
    expect(h.loader.inFlightCount()).toBe(0);
    expect(h.loader.loadedCount()).toBe(1);
    pending[0]!.fail("late");
    await h.drain();
    expect(h.failures).toEqual([]);
    expect(grandchild.isLoaded(0)).toBe(false);
  });

  it("release aborts everything and loads nothing more", async () => {
    const h = harness({ maxConcurrentRequests: 1 });
    h.loader.request([{ start: 0, end: 30 }]);
    h.loader.release();
    expect(h.sent[0]!.signal.aborted).toBe(true);
    await h.drain();
    h.loader.request([{ start: 0, end: 30 }]);
    expect(h.labels()).toEqual(["root#0"]);
    expect(h.root.isLoaded(0)).toBe(false);
  });

  it("reports a live branch's failure and requests a failed root page no more", async () => {
    const h = harness();
    h.loader.request([{ start: 0, end: 10 }]);
    h.sent[0]!.fail("boom");
    await flush();
    expect(h.failures).toEqual(["root#0 boom"]);
    h.loader.request([{ start: 0, end: 20 }]);
    expect(h.labels()).toEqual(["root#0", "root#1"]);
  });
});

describe("server grouping loader — eviction (D3)", () => {
  it("evicts the least recently required page first", async () => {
    const h = harness({ maxPages: 2 });
    await h.load(0, 10);
    await h.load(10, 20);
    await h.load(0, 10);
    await h.load(20, 30);
    expect(h.labels()).toEqual(["root#0", "root#1", "root#2"]);
    expect(h.evicted).toEqual(["root#1"]);
    expect(h.root.isLoaded(0)).toBe(true);
  });

  it("never evicts a required page, a loaded page on screen included", async () => {
    const h = harness({ maxPages: 1 });
    await h.load(0, 10);
    await h.load(5, 15);
    await h.load(0, 35);
    expect(h.evicted).toEqual([]);
    expect(h.loader.loadedCount()).toBe(4);

    await h.load(90, 100);
    expect(h.evicted).toEqual(["root#0", "root#1", "root#2", "root#3"]);
    expect(h.loader.loadedCount()).toBe(1);
  });

  it("keeps a group page with an expanded child, whose nodes hold the child's counts", async () => {
    const h = harness({ childCount: 30, maxPages: 1, dimensions: 1 });
    await h.load(0, 30);
    h.root.expandChild(5, new Branch<Row>([step("g5")], 25, PAGE_SIZE));
    await h.load(7, 8);
    expect(h.labels().at(-1)).toBe("g5#0");
    expect(h.evicted).toEqual(["root#1", "root#2"]);
    expect(h.root.isLoaded(0)).toBe(true);
  });
});
