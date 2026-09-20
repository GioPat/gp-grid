import { describe, expect, it } from "vitest";
import { createFixedAxis } from "../src/geometry/fixed-axis";
import { createPrefixAxis } from "../src/geometry/prefix-axis";
import type { VirtualAxis } from "../src/geometry/virtual-axis";

const fixedOracle = (count: number, size: number) => (offset: number): number => {
  if (Number.isNaN(offset) || offset < 0) return -1;
  if (offset >= count * size) return count;
  let index = 0;
  while (index < count && (index + 1) * size <= offset) index++;
  return index;
};

const prefixOracle = (sizes: readonly number[]) => (offset: number): number => {
  if (Number.isNaN(offset) || offset < 0) return -1;
  let running = 0;
  for (let i = 0; i < sizes.length; i++) {
    running += sizes[i]!;
    if (offset < running) return i;
  }
  return sizes.length;
};

const runIndexOracle = (
  label: string,
  axis: VirtualAxis,
  oracle: (offset: number) => number,
  offsets: readonly number[],
): void => {
  for (let i = 0; i < offsets.length; i++) {
    const edge = offsets[i]!;
    for (const offset of [edge - 1, edge - Number.EPSILON, edge, edge + Number.EPSILON, edge + 1]) {
      expect(axis.indexAt(offset), `${label} indexAt(${offset})`).toBe(oracle(offset));
    }
    const next = offsets[i + 1];
    if (next !== undefined) {
      const mid = (edge + next) / 2;
      expect(axis.indexAt(mid), `${label} mid(${mid})`).toBe(oracle(mid));
    }
  }
};

const allOffsets = (axis: VirtualAxis): number[] =>
  Array.from({ length: axis.count + 1 }, (_, i) => axis.getOffset(i));

describe("createFixedAxis", () => {
  const cases: Array<{ count: number; size: number }> = [
    { count: 1, size: 1 },
    { count: 1, size: 32 },
    { count: 7, size: 10 },
    { count: 40, size: 32.5 },
    { count: 1000, size: 32 },
    { count: 3, size: 0.5 },
  ];

  it.each(cases)("indexAt matches the oracle for $count × $size", ({ count, size }) => {
    const axis = createFixedAxis(count, size);
    const oracle = fixedOracle(count, size);
    runIndexOracle("fixed", axis, oracle, allOffsets(axis));
  });

  it("indexAt matches sampled oracle answers for a large count", () => {
    const count = 50_000;
    const size = 32;
    const axis = createFixedAxis(count, size);
    const oracle = fixedOracle(count, size);
    // The oracle walks item by item, so a large count is checked at sampled
    // offsets rather than at every edge.
    for (const offset of [0, 32, 1_000 * size, 25_000 * size, (count - 4) * size, count * size]) {
      expect(axis.indexAt(offset), `indexAt(${offset})`).toBe(oracle(offset));
      expect(axis.indexAt(offset + 1), `indexAt(${offset + 1})`).toBe(oracle(offset + 1));
    }
    expect(axis.getWindow(25_000 * size, 640, 2)).toEqual({
      start: 25_000 - 2,
      end: 25_000 + 22,
    });
  });

  it("reports sizes, offsets and extent", () => {
    const axis = createFixedAxis(4, 25);
    expect(axis.count).toBe(4);
    expect(axis.extent).toBe(100);
    expect(axis.getOffset(0)).toBe(0);
    expect(axis.getOffset(4)).toBe(100);
    expect(axis.getOffset(-3)).toBe(0);
    expect(axis.getOffset(9)).toBe(100);
    expect(axis.getSize(2)).toBe(25);
    expect(axis.getSize(-1)).toBe(0);
    expect(axis.getSize(4)).toBe(0);
  });

  it("answers indexAt sentinels for negative, NaN and out-of-range offsets", () => {
    const axis = createFixedAxis(10, 20);
    expect(axis.indexAt(0)).toBe(0);
    expect(axis.indexAt(-1)).toBe(-1);
    expect(axis.indexAt(Number.NEGATIVE_INFINITY)).toBe(-1);
    expect(axis.indexAt(Number.NaN)).toBe(-1);
    expect(axis.indexAt(199.9)).toBe(9);
    expect(axis.indexAt(200)).toBe(10);
    expect(axis.indexAt(200.5)).toBe(10);
    expect(axis.indexAt(Number.POSITIVE_INFINITY)).toBe(10);
  });

  it("keeps an empty axis empty", () => {
    const axis = createFixedAxis(0, 32);
    expect(axis.extent).toBe(0);
    expect(axis.getOffset(0)).toBe(0);
    expect(axis.indexAt(0)).toBe(0);
    expect(axis.indexAt(12)).toBe(0);
    expect(axis.getWindow(0, 400)).toEqual({ start: 0, end: 0 });
  });

  it("allocates nothing per row for very large counts (AC-003-01)", () => {
    const before = process.memoryUsage().heapUsed;
    const axis = createFixedAxis(1e12, 32);
    const after = process.memoryUsage().heapUsed;
    expect(after - before).toBeLessThan(64 * 1024);
    const lastOffset = axis.getOffset(axis.count);
    expect(lastOffset).toBe(3.2e13);
    expect(axis.indexAt(Number.POSITIVE_INFINITY)).toBe(axis.count);
    expect(axis.indexAt(lastOffset - 32)).toBe(axis.count - 1);
  });

  it("rejects invalid counts, sizes and aggregate extents", () => {
    expect(() => createFixedAxis(-1, 32)).toThrow(RangeError);
    expect(() => createFixedAxis(1.5, 32)).toThrow(RangeError);
    expect(() => createFixedAxis(Number.NaN, 32)).toThrow(RangeError);
    expect(() => createFixedAxis(2, 0)).toThrow(RangeError);
    expect(() => createFixedAxis(2, -4)).toThrow(RangeError);
    expect(() => createFixedAxis(2, Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => createFixedAxis(2, Number.NaN)).toThrow(RangeError);
    expect(() => createFixedAxis(2, Number.MAX_VALUE)).toThrow(RangeError);
    expect(() => createFixedAxis(2, 32).getOffset(1.5)).toThrow(RangeError);
    expect(() => createFixedAxis(2, 32).getOffset(Number.NaN)).toThrow(RangeError);
  });
});

describe("createPrefixAxis", () => {
  const cases: number[][] = [
    [32],
    [32, 33],
    [10, 20, 30],
    [7.5, 12.25, 0.5, 100],
    Array.from({ length: 500 }, (_, i) => 20 + (i % 7)),
  ];

  it.each(cases.map((sizes) => [sizes.length, sizes] as const))(
    "indexAt matches the oracle for %i sizes",
    (_length, sizes) => {
      const axis = createPrefixAxis(sizes);
      const oracle = prefixOracle(sizes);
      const offsets = Array.from({ length: sizes.length + 1 }, (_, i) => axis.getOffset(i));
      runIndexOracle("prefix", axis, oracle, offsets);
    },
  );

  it("reports stored sizes and cumulative offsets", () => {
    const axis = createPrefixAxis([10, 20, 30]);
    expect(axis.count).toBe(3);
    expect(axis.extent).toBe(60);
    expect(axis.getOffset(0)).toBe(0);
    expect(axis.getOffset(1)).toBe(10);
    expect(axis.getOffset(3)).toBe(60);
    expect(axis.getOffset(-1)).toBe(0);
    expect(axis.getOffset(8)).toBe(60);
    expect(axis.getSize(1)).toBe(20);
    expect(axis.getSize(3)).toBe(0);
    expect(axis.getSize(-1)).toBe(0);
  });

  it("answers indexAt sentinels and accepts a copied caller array", () => {
    const sizes = [10, 20];
    const axis = createPrefixAxis(sizes);
    sizes[0] = 999;
    expect(axis.getSize(0)).toBe(10);
    expect(axis.indexAt(5)).toBe(0);
    expect(axis.indexAt(10)).toBe(1);
    expect(axis.indexAt(29.9)).toBe(1);
    expect(axis.indexAt(30)).toBe(2);
    expect(axis.indexAt(-1)).toBe(-1);
    expect(axis.indexAt(Number.NaN)).toBe(-1);
    expect(axis.indexAt(Number.POSITIVE_INFINITY)).toBe(2);
  });

  it("rejects invalid sizes and non-finite aggregates", () => {
    expect(() => createPrefixAxis([10, 0])).toThrow(RangeError);
    expect(() => createPrefixAxis([10, -1])).toThrow(RangeError);
    expect(() => createPrefixAxis([10, Number.NaN])).toThrow(RangeError);
    expect(() => createPrefixAxis([10, Number.POSITIVE_INFINITY])).toThrow(RangeError);
    expect(() => createPrefixAxis([Number.MAX_VALUE, Number.MAX_VALUE])).toThrow(RangeError);
  });

  it("rejects a size too small to advance the running offset", () => {
    expect(() => createPrefixAxis([1e16, 1])).toThrow(RangeError);
    expect(createPrefixAxis([1e15, 1]).extent).toBe(1e15 + 1);
  });

  it("validates size indices like offset indices", () => {
    const axes = [createFixedAxis(2, 32), createPrefixAxis([10, 20])];
    for (const axis of axes) {
      expect(() => axis.getSize(1.5)).toThrow(RangeError);
      expect(() => axis.getSize(Number.NaN)).toThrow(RangeError);
      expect(() => axis.getSize(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
      expect(axis.getSize(-1)).toBe(0);
    }
  });
});

describe("axis windows", () => {
  it("covers intersecting items and widens by overscan", () => {
    const axis = createFixedAxis(100, 32);
    expect(axis.getWindow(0, 96)).toEqual({ start: 0, end: 3 });
    expect(axis.getWindow(0, 96, 2)).toEqual({ start: 0, end: 5 });
    expect(axis.getWindow(100, 96, 2)).toEqual({ start: 1, end: 9 });
    expect(axis.getWindow(3168, 96, 4)).toEqual({ start: 95, end: 100 });
  });

  it("widens by overscan for prefix axes", () => {
    const axis = createPrefixAxis([10, 20, 30, 40]);
    expect(axis.getWindow(0, 35)).toEqual({ start: 0, end: 3 });
    expect(axis.getWindow(0, 35, 1)).toEqual({ start: 0, end: 4 });
    expect(axis.getWindow(35, 20)).toEqual({ start: 2, end: 3 });
    expect(axis.getWindow(85, 20)).toEqual({ start: 3, end: 4 });
  });

  it("returns an empty anchored window outside content", () => {
    const axis = createFixedAxis(10, 20);
    expect(axis.getWindow(2000, 100)).toEqual({ start: 10, end: 10 });
    expect(axis.getWindow(2000, 100, 3)).toEqual({ start: 10, end: 10 });
    expect(axis.getWindow(-50, 100)).toEqual({ start: 0, end: 3 });
    expect(axis.getWindow(-50, 100, 3)).toEqual({ start: 0, end: 6 });
    expect(axis.getWindow(0, 0)).toEqual({ start: 0, end: 0 });
    expect(axis.getWindow(40, 0, 2)).toEqual({ start: 2, end: 2 });
  });

  it("returns an empty anchored window for invalid offsets and extents", () => {
    const axis = createFixedAxis(10, 20);
    expect(axis.getWindow(Number.NaN, 100)).toEqual({ start: 0, end: 0 });
    expect(axis.getWindow(Number.POSITIVE_INFINITY, 100)).toEqual({ start: 10, end: 10 });
    expect(axis.getWindow(Number.NEGATIVE_INFINITY, 100)).toEqual({ start: 0, end: 0 });
    expect(axis.getWindow(0, Number.NaN)).toEqual({ start: 0, end: 0 });
    expect(axis.getWindow(40, Number.POSITIVE_INFINITY)).toEqual({ start: 2, end: 2 });
    expect(axis.getWindow(40, -10, 3)).toEqual({ start: 2, end: 2 });
  });

  it("keeps overscan within the axis and rejects invalid overscan", () => {
    const axis = createFixedAxis(4, 10);
    expect(axis.getWindow(0, 40, 100)).toEqual({ start: 0, end: 4 });
    expect(axis.getWindow(0, 40, 0)).toEqual({ start: 0, end: 4 });
    expect(() => axis.getWindow(0, 40, -1)).toThrow(RangeError);
    expect(() => axis.getWindow(0, 40, 1.5)).toThrow(RangeError);
    expect(() => axis.getWindow(0, 40, Number.NaN)).toThrow(RangeError);
  });

  it("anchors a fractional window below the first item", () => {
    const axis = createFixedAxis(10, 32);
    expect(axis.getWindow(31.5, 64)).toEqual({ start: 0, end: 3 });
    expect(axis.getWindow(-0.5, 64)).toEqual({ start: 0, end: 2 });
  });
});
