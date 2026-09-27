import { describe, expect, it } from "vitest";
import { createFixedAxis } from "../src/geometry/fixed-axis";
import { createOverrideAxis } from "../src/geometry/override-axis";
import { createPrefixAxis } from "../src/geometry/prefix-axis";
import { resolveFrozenRows } from "../src/geometry/row-regions";
import type { VirtualAxis } from "../src/geometry/virtual-axis";
import { getRequiredPageBlocks, getRequiredPageRanges } from "../src/managers/page-blocks";
import { createFrozenPrefixBudget, maxRequiredPages } from "../src/managers/page-capacity";

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

describe("page capacity", () => {
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

  it("bounds a non-uniform axis without a uniformity precondition", () => {
    const axis = createPrefixAxis([13, 12, 39, 6, 33, 16, 35, 26, 5, 4, 7, 14, 1, 40]);
    const position = { axis, pageSize: 2, viewportHeight: 122, frozenCount: 4 };
    expect(getRequiredPageBlocks({ ...position, scrollTop: 88.25 })).toEqual([0, 1, 3, 4, 5, 6]);
    const exact = bruteForceMaxPages(axis, 2, 122, 4);
    const bound = maxRequiredPages(position);
    expect(bound).toBeGreaterThanOrEqual(exact);
    // Conservative on purpose: the three interior first rows of the uniform
    // enumeration are not reachable here, so the prefix+suffix bound exceeds
    // the exact maximum by one block.
    expect(bound).toBeGreaterThan(exact);
  });

  it("never undershoots a brute-force oracle on random non-uniform axes", () => {
    const random = createRandom(90210);
    const heights = [5, 8, 13, 21, 34, 40];
    for (let sample = 0; sample < 120; sample++) {
      const rowCount = 1 + random(24);
      const sizes = Array.from({ length: rowCount }, () => pick(random, heights));
      const axis = createPrefixAxis(sizes);
      const pageSize = pick(random, [1, 2, 3, 5]);
      const viewportHeight = pick(random, [0, 24, 64, 120, 200]);
      const frozenCount = random(rowCount + 1);
      const input = { axis, pageSize, viewportHeight, frozenCount };
      const exact = bruteForceMaxPages(axis, pageSize, viewportHeight, frozenCount);
      const bound = maxRequiredPages(input);
      expect(bound, JSON.stringify({ sizes, pageSize, viewportHeight, frozenCount }))
        .toBeGreaterThanOrEqual(exact);
    }
  });

  it("never undershoots when the clip spans several pages below the prefix", () => {
    const random = createRandom(26092026);
    for (let sample = 0; sample < 80; sample++) {
      const rowCount = 20 + random(60);
      const placed = [...new Set(Array.from({ length: 1 + random(8) }, () => random(rowCount)))]
        .sort((a, b) => a - b)
        .map((index) => ({ index, size: pick(random, [4, 20, 48]) }));
      const axis = createOverrideAxis(rowCount, 10, placed);
      const pageSize = pick(random, [3, 7, 10]);
      const viewportHeight = pick(random, [120, 215, 300]);
      const frozenCount = random(Math.min(rowCount, 8) + 1);
      const exact = bruteForceMaxPages(axis, pageSize, viewportHeight, frozenCount);
      const bound = maxRequiredPages({ axis, pageSize, viewportHeight, frozenCount });
      expect(bound, JSON.stringify({ placed, rowCount, pageSize, viewportHeight, frozenCount }))
        .toBeGreaterThanOrEqual(exact);
    }
  });

  it("reduces the prefix with a cache limit on a non-uniform axis", () => {
    const axis = createPrefixAxis([13, 12, 39, 6, 33, 16, 35, 26, 5, 4, 7, 14, 1, 40]);
    const budget = { axis, pageSize: 2, viewportHeight: 122, maxPages: 3 };
    expect(resolveFrozenRows({
      axis,
      requestedCount: 4,
      viewportHeight: 122,
      viewportMeasured: true,
      admitsPrefix: createFrozenPrefixBudget(budget),
    })).toEqual({ requestedCount: 4, effectiveCount: 0, limit: "cache" });
    // A roomy budget admits the same request; the viewport limit is not the
    // cache's, so the reduce path is what this asserts.
    const roomy = createFrozenPrefixBudget({ ...budget, maxPages: 8 });
    const generous = resolveFrozenRows({
      axis,
      requestedCount: 2,
      viewportHeight: 122,
      viewportMeasured: true,
      admitsPrefix: roomy,
    });
    expect(generous).toEqual({ requestedCount: 2, effectiveCount: 2, limit: null });
  });

  it("keeps the exact bound for uniform prefix axes", () => {
    const uniform = createPrefixAxis([12, 12, 12, 12, 12, 12, 12, 12]);
    const fixed = createFixedAxis(8, 12);
    const input = { pageSize: 2, viewportHeight: 64, frozenCount: 3 };
    expect(maxRequiredPages({ ...input, axis: uniform }))
      .toBe(maxRequiredPages({ ...input, axis: fixed }));
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

  it("falls back to the extent default for a non-finite maxScrollTop", () => {
    const axis = createFixedAxis(1000, 32);
    const input = { axis, pageSize: 100, viewportHeight: 320, frozenCount: 2 };
    expect(maxRequiredPages({ ...input, maxScrollTop: Number.NaN })).toBe(maxRequiredPages(input));
  });

  it("refuses any bound on a non-uniform axis without a positive minimum size", () => {
    const sized = createPrefixAxis([5, 10, 20]);
    const withMinSize = (minSize?: number): VirtualAxis => ({
      count: sized.count,
      extent: sized.extent,
      getSize: (index) => sized.getSize(index),
      getOffset: (index) => sized.getOffset(index),
      indexAt: (offset) => sized.indexAt(offset),
      getWindow: (offset, extent, overscan) => sized.getWindow(offset, extent, overscan),
      minSize,
    });
    const input = { pageSize: 1, viewportHeight: 15, frozenCount: 0 };

    expect(maxRequiredPages({ ...input, axis: withMinSize() })).toBe(Number.POSITIVE_INFINITY);
    expect(maxRequiredPages({ ...input, axis: withMinSize(0) })).toBe(Number.POSITIVE_INFINITY);
    expect(maxRequiredPages({ ...input, axis: withMinSize(5) })).toBe(maxRequiredPages({ ...input, axis: sized }));
  });

  it("treats an invalid page size as one row per page", () => {
    const axis = createFixedAxis(100, 32);
    expect(maxRequiredPages({ axis, pageSize: 0, viewportHeight: 320, frozenCount: 0 }))
      .toBe(maxRequiredPages({ axis, pageSize: 1, viewportHeight: 320, frozenCount: 0 }));
  });
});
