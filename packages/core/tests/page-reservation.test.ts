import { describe, expect, it } from "vitest";
import { createFixedAxis } from "../src/geometry/fixed-axis";
import { createPrefixAxis } from "../src/geometry/prefix-axis";
import { resolveFrozenRows } from "../src/geometry/row-regions";
import type { VirtualAxis } from "../src/geometry/virtual-axis";
import {
  admitOptionalPages,
  createFrozenPrefixBudget,
  evictionCandidates,
  getRequiredPageBlocks,
  getRequiredPageRanges,
  maxRequiredPages,
  resolvePrefixReservations,
} from "../src/managers/page-reservation";

const createRandom = (seed: number) => {
  let state = seed >>> 0;
  return (limit: number): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state % limit;
  };
};

const pick = <T>(random: (limit: number) => number, values: readonly T[]): T =>
  values[random(values.length)]!;

/** Independent reference: rows intersecting the clip, blocks deduplicated. */
const bruteForceMaxPages = (
  axis: VirtualAxis,
  pageSize: number,
  viewportHeight: number,
  frozenCount: number,
  maxScrollTop?: number,
): number => {
  const frozen = Math.min(frozenCount, axis.count);
  const frozenExtent = axis.getOffset(frozen);
  const clipHeight = Math.max(0, viewportHeight - frozenExtent);
  const maxScroll = maxScrollTop ?? Math.max(0, axis.extent - viewportHeight);
  let largest = 0;
  for (let scroll = 0; scroll <= maxScroll; scroll++) {
    const blocks = new Set<number>();
    for (let row = 0; row < frozen; row++) blocks.add(Math.floor(row / pageSize));
    const top = scroll + frozenExtent;
    const bottom = top + clipHeight;
    for (let row = frozen; clipHeight > 0 && row < axis.count; row++) {
      if (axis.getOffset(row) < bottom && axis.getOffset(row + 1) > top) {
        blocks.add(Math.floor(row / pageSize));
      }
    }
    largest = Math.max(largest, blocks.size);
  }
  return largest;
};

const bigAxis = createFixedAxis(1_000_000, 32);
const bigBase = { axis: bigAxis, pageSize: 100, viewportHeight: 320 };
const straddleScrollTop = 899_999 * 32 - 64;

const resolveWithBudget = (
  viewportHeight: number,
  maxPages: number,
  requestedCount = 2,
): ReturnType<typeof resolveFrozenRows> =>
  resolveFrozenRows({
    axis: bigAxis,
    requestedCount,
    viewportHeight,
    viewportMeasured: true,
    admitsPrefix: createFrozenPrefixBudget({ ...bigBase, viewportHeight, maxPages }),
  });

describe("page reservation capacity", () => {
  it("requests only the prefix and the suffix blocks near row 900,000", () => {
    expect(getRequiredPageBlocks({ ...bigBase, frozenCount: 0, scrollTop: straddleScrollTop }))
      .toEqual([8999, 9000]);
    expect(getRequiredPageBlocks({ ...bigBase, frozenCount: 2, scrollTop: straddleScrollTop }))
      .toEqual([0, 8999, 9000]);
    expect(getRequiredPageRanges({ ...bigBase, frozenCount: 2, scrollTop: straddleScrollTop }).gap)
      .toEqual({ start: 1, end: 8999 });
    expect(maxRequiredPages({ ...bigBase, frozenCount: 0 })).toBe(2);
    expect(maxRequiredPages({ ...bigBase, frozenCount: 2 })).toBe(3);
  });

  it("reduces the prefix at maxPages 2 and retains it at 3", () => {
    expect(resolveWithBudget(320, 2)).toEqual({ requestedCount: 2, effectiveCount: 0, limit: "cache" });
    expect(resolveWithBudget(320, 3)).toEqual({ requestedCount: 2, effectiveCount: 2, limit: null });
    expect(resolveWithBudget(320, 4).effectiveCount).toBe(2);
  });

  it("stays within the bound across scroll positions", () => {
    const bound = maxRequiredPages({ ...bigBase, frozenCount: 2 });
    // The same page geometry on a brute-forceable axis reaches the bound.
    const small = createFixedAxis(250, 32);
    const smallInput = { axis: small, pageSize: 100, viewportHeight: 320, frozenCount: 2 };
    const exact = bruteForceMaxPages(small, 100, 320, 2);
    expect(maxRequiredPages(smallInput)).toBe(exact);
    expect(exact).toBe(bound);
    for (let step = 0; step <= 20; step++) {
      const scrollTop = Math.min(step * 1_500_000, 31_999_680);
      const blocks = getRequiredPageBlocks({ ...bigBase, frozenCount: 2, scrollTop });
      expect(blocks.length).toBeLessThanOrEqual(bound);
      expect(blocks).toContain(0);
    }
    const budget = createFrozenPrefixBudget({ ...bigBase, maxPages: 3 });
    expect(budget(2)).toBe(true);
    expect(budget(0)).toBe(true);
    expect(budget(100)).toBe(true);
    const fine = createFrozenPrefixBudget({ axis: bigAxis, pageSize: 10, viewportHeight: 320, maxPages: 3 });
    expect(fine(8)).toBe(true);
    expect(fine(40)).toBe(false);
  });

  it("honours an explicit maxScrollTop over the extent default", () => {
    const axis = createFixedAxis(250, 32);
    const base = { axis, pageSize: 100, viewportHeight: 122, frozenCount: 2 };
    const plain = maxRequiredPages(base);
    expect(plain).toBe(bruteForceMaxPages(axis, 100, 122, 2));
    // A row-boundary-rounded reachable end only adds window subsets of the default bottom one.
    const rounded = axis.getOffset(axis.indexAt(axis.extent - 122) + 1);
    expect(maxRequiredPages({ ...base, maxScrollTop: rounded })).toBe(plain);
    const reachable = axis.getOffset(196);
    const shrunk = maxRequiredPages({ ...base, maxScrollTop: reachable });
    expect(shrunk).toBe(bruteForceMaxPages(axis, 100, 122, 2, reachable));
    expect(shrunk).toBeLessThan(plain);
  });

  it("requires a uniform row axis for the capacity bound", () => {
    const axis = createPrefixAxis([13, 12, 39, 6, 33, 16, 35, 26, 5, 4, 7, 14, 1, 40]);
    const position = { axis, pageSize: 2, viewportHeight: 122, frozenCount: 4 };
    expect(getRequiredPageBlocks({ ...position, scrollTop: 88.25 })).toEqual([0, 1, 3, 4, 5, 6]);
    expect(() => maxRequiredPages(position)).toThrow(RangeError);
  });

  it("matches a brute-force oracle on small datasets", () => {
    const random = createRandom(4242);
    for (let sample = 0; sample < 150; sample++) {
      const rowCount = random(41);
      const rowHeight = pick(random, [8, 10, 32]);
      const viewportHeight = pick(random, [0, 20, 64, 100, 200]);
      const pageSize = pick(random, [1, 2, 3, 4, 7]);
      const frozenCount = random(rowCount + 1);
      const axis = createFixedAxis(rowCount, rowHeight);
      const input = { axis, pageSize, viewportHeight, frozenCount };
      const expected = bruteForceMaxPages(axis, pageSize, viewportHeight, frozenCount);
      expect({ rowCount, rowHeight, viewportHeight, pageSize, frozenCount, bound: maxRequiredPages(input) })
        .toEqual({ rowCount, rowHeight, viewportHeight, pageSize, frozenCount, bound: expected });
    }
  });

  it("covers partial rows, shared pages and all-frozen data", () => {
    const axis = createFixedAxis(250, 32);
    const shared = { axis, pageSize: 100, viewportHeight: 320, frozenCount: 2 };
    expect(getRequiredPageBlocks({ ...shared, scrollTop: 0 })).toEqual([0]);
    expect(getRequiredPageBlocks({ ...shared, scrollTop: 4000 })).toEqual([0, 1]);
    expect(getRequiredPageBlocks({ ...shared, scrollTop: 7000 })).toEqual([0, 2]);
    expect(getRequiredPageRanges({ ...shared, scrollTop: 4000 }).gap).toBeNull();
    expect(getRequiredPageRanges({ ...shared, scrollTop: 7000 }).gap).toEqual({ start: 1, end: 2 });
    expect(maxRequiredPages(shared)).toBe(3);
    const partial = { axis: createFixedAxis(6, 32), pageSize: 4, viewportHeight: 100, frozenCount: 2 };
    expect(getRequiredPageBlocks({ ...partial, scrollTop: 0 })).toEqual([0]);
    expect(getRequiredPageBlocks({ ...partial, scrollTop: 92 })).toEqual([0, 1]);
    expect(maxRequiredPages(partial)).toBe(2);
    expect(maxRequiredPages({ ...partial, frozenCount: 4 })).toBe(1);
    expect(maxRequiredPages({ axis, pageSize: 4, viewportHeight: 100, frozenCount: 250 })).toBe(63);
    expect(maxRequiredPages({ axis, pageSize: 4, viewportHeight: 100, frozenCount: 0 })).toBe(2);
  });

  it("falls back to zero with a soft window when even the window exceeds the cap", () => {
    expect(resolveWithBudget(320, 1)).toEqual({ requestedCount: 2, effectiveCount: 0, limit: "cache" });
    expect(getRequiredPageBlocks({ ...bigBase, frozenCount: 0, scrollTop: straddleScrollTop }))
      .toEqual([8999, 9000]);
    const flat = resolveFrozenRows({
      axis: bigAxis,
      requestedCount: 0,
      viewportHeight: 320,
      viewportMeasured: true,
      admitsPrefix: createFrozenPrefixBudget({ ...bigBase, maxPages: 1 }),
    });
    expect(flat).toEqual({ requestedCount: 0, effectiveCount: 0, limit: null });
  });

  it("restores the count after a resize or a budget change", () => {
    expect(resolveWithBudget(320, 3).effectiveCount).toBe(2);
    expect(resolveWithBudget(96, 3)).toEqual({ requestedCount: 2, effectiveCount: 1, limit: "viewport" });
    expect(resolveWithBudget(320, 3).effectiveCount).toBe(2);
    expect(resolveWithBudget(320, 2)).toEqual({ requestedCount: 2, effectiveCount: 0, limit: "cache" });
    expect(resolveWithBudget(320, 5).effectiveCount).toBe(2);
  });
});

describe("page admission and reservations", () => {
  it("admits optional pages nearest-first and never fills the gap", () => {
    const required = [10, 11];
    expect(admitOptionalPages({
      required,
      loaded: required,
      reserved: [],
      maxPages: 4,
      overscan: [12, 9],
      prefetch: [8, 13],
    })).toEqual([9, 12]);
    expect(admitOptionalPages({ required, loaded: required, reserved: [], maxPages: 3, overscan: [9, 12] }))
      .toEqual([9]);
    expect(admitOptionalPages({
      required: [0, 20],
      loaded: [0, 20],
      reserved: [],
      maxPages: 6,
      overscan: [5, 19],
      prefetch: [21],
      gap: { start: 1, end: 20 },
    })).toEqual([21]);
    expect(admitOptionalPages({
      required: [0, 8999, 9000],
      loaded: [],
      reserved: [],
      maxPages: 3,
      overscan: [1],
    })).toEqual([]);
    expect(admitOptionalPages({
      required,
      loaded: required,
      reserved: [12],
      maxPages: 4,
      overscan: [9, 13],
    })).toEqual([9]);
  });

  it("filters eviction candidates away from protected blocks", () => {
    expect(evictionCandidates({ loaded: [0, 1, 2, 3], protectedBlocks: [0, 8999, 9000], center: 9000 }))
      .toEqual([1, 2, 3]);
    expect(evictionCandidates({ loaded: [0, 1], protectedBlocks: [0, 1], center: 0 })).toEqual([]);
    expect(evictionCandidates({ loaded: [5, 4, 6], protectedBlocks: [5, 6], center: 5 })).toEqual([4]);
  });

  it("keeps load order between equidistant eviction candidates", () => {
    expect(evictionCandidates({ loaded: [3, 0, 2], protectedBlocks: [], center: 1 })).toEqual([3, 0, 2]);
  });

  it("never evicts visible suffix or reserved prefix pages", () => {
    const required = [0, 8999, 9000];
    const reserved = resolvePrefixReservations([], 2, 100);
    const protectedBlocks = [...required, ...reserved.pages];
    const candidates = evictionCandidates({ loaded: [...required, 8998, 1], protectedBlocks, center: 9000 });
    expect(candidates).toEqual([1, 8998]);
    for (const block of candidates) {
      expect(protectedBlocks).not.toContain(block);
    }
  });

  it("keeps loaded plus reserved capacity through replacement sequences", () => {
    const required = [0, 8999, 9000];
    const loaded = new Set<number>();
    const reserved = new Set<number>();
    expect(admitOptionalPages({
      required,
      loaded: [...loaded],
      reserved: [...reserved],
      maxPages: 3,
      overscan: [8998],
    })).toEqual([]);
    for (const block of required) loaded.add(block);
    expect(admitOptionalPages({
      required,
      loaded: [...loaded],
      reserved: [...reserved],
      maxPages: 4,
      overscan: [8998],
    })).toEqual([8998]);
    reserved.add(8998);
    expect(admitOptionalPages({
      required,
      loaded: [...loaded],
      reserved: [...reserved],
      maxPages: 4,
      overscan: [8998],
    })).toEqual([]);
    loaded.add(8998);
    reserved.delete(8998);
    loaded.add(1);
    loaded.add(2);
    const evicted = evictionCandidates({
      loaded: [...loaded],
      protectedBlocks: [...required, 8998],
      center: 9000,
    });
    expect(evicted).toEqual([1, 2]);
    for (const block of evicted) loaded.delete(block);
    expect(new Set([...loaded, ...reserved]).size).toBeLessThanOrEqual(4);
  });

  it("keeps and releases prefix reservations", () => {
    const first = resolvePrefixReservations([], 250, 100);
    expect(first).toEqual({ pages: [0, 1, 2], released: [] });
    expect(resolvePrefixReservations(first.pages, 250, 100)).toEqual({ pages: [0, 1, 2], released: [] });
    expect(resolvePrefixReservations(first.pages, 150, 100)).toEqual({ pages: [0, 1], released: [2] });
    expect(resolvePrefixReservations([], 200, 100)).toEqual({ pages: [0, 1], released: [] });
    expect(resolvePrefixReservations([0, 1, 2, 3], 200, 100)).toEqual({ pages: [0, 1], released: [2, 3] });
    expect(resolvePrefixReservations([0, 1], 250, 100)).toEqual({ pages: [0, 1, 2], released: [] });
    expect(resolvePrefixReservations([0, 1, 2], 0, 100)).toEqual({ pages: [], released: [0, 1, 2] });
    expect(resolvePrefixReservations([], 0, 100)).toEqual({ pages: [], released: [] });
  });
});
