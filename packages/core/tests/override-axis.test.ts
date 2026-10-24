// packages/core/tests/override-axis.test.ts
// Slice 1 of PRD 006: the override axis against a naive running-sum oracle,
// its flags, its validation and its construction cost (AC-006-01, AC-006-02).

import { describe, expect, it } from "vitest";
import { createFixedAxis } from "../src/geometry/fixed-axis";
import { createOverrideAxis, type PlacedRowSize } from "../src/geometry/override-axis";
import type { VirtualAxis } from "../src/geometry/virtual-axis";

// Sizes on a 1/64 px grid keep every running sum exact in float64, so the
// oracle and the axis can be compared bit for bit.
const QUANTUM = 64;

const createRandom = (seed: number) => {
  let state = seed >>> 0;
  return (limit: number): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state % limit;
  };
};

interface Oracle {
  readonly sizes: number[];
  readonly offsets: number[];
  indexAt(offset: number): number;
}

/** Independent reference: the dense size list and its running sums. */
const buildOracle = (
  count: number,
  defaultSize: number,
  placed: readonly PlacedRowSize[],
): Oracle => {
  const sizes = new Array<number>(count).fill(defaultSize);
  for (const entry of placed) {
    sizes[entry.index] = entry.size;
  }
  const offsets = new Array<number>(count + 1);
  offsets[0] = 0;
  for (let i = 0; i < count; i++) {
    offsets[i + 1] = offsets[i]! + sizes[i]!;
  }
  return {
    sizes,
    offsets,
    indexAt: (offset: number): number => {
      if (Number.isNaN(offset) || offset < 0) return -1;
      if (offset >= offsets[count]!) return count;
      let index = 0;
      while (index < count && offsets[index + 1]! <= offset) index++;
      return index;
    },
  };
};

const randomPlaced = (
  random: (limit: number) => number,
  count: number,
  k: number,
  defaultSize: number,
): PlacedRowSize[] => {
  const indices = new Set<number>();
  while (indices.size < Math.min(k, count)) {
    indices.add(random(count));
  }
  return [...indices]
    .sort((a, b) => a - b)
    .map((index) => {
      // [16, 256) on the quantum grid, shrinking and growing rows; a placed
      // size never equals the default, since that is not a placement.
      const size = 16 + random(240 * QUANTUM) / QUANTUM;
      return { index, size: size === defaultSize ? size + 1 / QUANTUM : size };
    });
};

const expectSameQuery = (
  label: string,
  axis: VirtualAxis,
  oracle: Oracle,
): void => {
  expect(axis.extent, `${label} extent`).toBe(oracle.offsets.at(-1));
  for (let i = 0; i <= axis.count; i++) {
    expect(axis.getOffset(i), `${label} getOffset(${i})`).toBe(oracle.offsets[i]);
  }
  for (let i = 0; i < axis.count; i++) {
    expect(axis.getSize(i), `${label} getSize(${i})`).toBe(oracle.sizes[i]);
  }
  for (let i = 0; i <= axis.count; i++) {
    const edge = oracle.offsets[i]!;
    for (const offset of [edge - 1 / QUANTUM, edge, edge + 1 / QUANTUM]) {
      expect(axis.indexAt(offset), `${label} indexAt(${offset})`).toBe(oracle.indexAt(offset));
    }
  }
  for (const offset of [-1, 0, oracle.offsets.at(-1)! / 2, oracle.offsets.at(-1)!]) {
    for (const extent of [0, 37, 320, 1000]) {
      for (const overscan of [0, 2]) {
        expect(axis.getWindow(offset, extent, overscan))
          .toEqual(windowOfOracle(oracle, offset, extent, overscan));
      }
    }
  }
};

/** The A1 window rules over the oracle's own offsets. */
const windowOfOracle = (
  oracle: Oracle,
  offset: number,
  viewportExtent: number,
  overscan: number,
): { start: number; end: number } => {
  const count = oracle.sizes.length;
  const indexAt = (value: number): number => oracle.indexAt(value);
  const anchor = (index: number): { start: number; end: number } => {
    const clamped = Math.min(Math.max(index, 0), count);
    return { start: clamped, end: clamped };
  };
  if (Number.isFinite(viewportExtent) === false || viewportExtent <= 0) {
    return anchor(indexAt(offset));
  }
  const startIndex = Math.max(indexAt(offset), 0);
  const endOffset = Math.min(offset + viewportExtent, oracle.offsets[count]!);
  const boundary = Math.max(indexAt(endOffset), 0);
  const endIndex = boundary < count && oracle.offsets[boundary]! < endOffset ? boundary + 1 : boundary;
  if (startIndex >= endIndex) return anchor(startIndex);
  return {
    start: Math.max(startIndex - overscan, 0),
    end: Math.min(endIndex + overscan, count),
  };
};

describe("createOverrideAxis — oracle", () => {
  const random = createRandom(20260926);

  it("matches a running-sum oracle for every query", () => {
    for (let sample = 0; sample < 60; sample++) {
      const count = 1 + random(60);
      const defaultSize = 16 + random(240 * QUANTUM) / QUANTUM;
      // Up to every row placed, so runs of consecutive shrunk rows occur.
      const placed = randomPlaced(random, count, 1 + random(count), defaultSize);
      const axis = createOverrideAxis(count, defaultSize, placed);
      expectSameQuery(JSON.stringify({ count, defaultSize, placed }), axis, buildOracle(count, defaultSize, placed));
    }
  });

  it("matches the oracle for a single placement at each edge of the axis", () => {
    for (const count of [1, 2, 5]) {
      for (const index of [0, count - 1, Math.floor(count / 2)]) {
        const defaultSize = 32;
        const placed = [{ index, size: 96 }];
        const axis = createOverrideAxis(count, defaultSize, placed);
        expectSameQuery(`${count}/${index}`, axis, buildOracle(count, defaultSize, placed));
      }
    }
  });

  it("resolves offsets above a run of consecutive shrunk rows", () => {
    const placed = [10, 11, 12, 13, 14].map((index) => ({ index, size: 1 }));
    const axis = createOverrideAxis(100, 32, placed);
    expectSameQuery("shrunk run", axis, buildOracle(100, 32, placed));
    expect(axis.indexAt(axis.getOffset(10) - 5)).toBe(9);
  });

  it("keeps arbitrary fractional sizes self-consistent", () => {
    // The 003 A2 rule: test each axis against its own offsets rather than
    // requiring bit-identical edges between representations.
    for (let sample = 0; sample < 40; sample++) {
      const count = 2 + random(40);
      const defaultSize = 16 + random(1000) / 7;
      const placed = Array.from({ length: 1 + random(4) }, (_, at) => ({
        index: Math.min(count - 1, at * 3 + random(2)),
        size: 4 + random(5000) / 13,
      }));
      const unique = [...new Map(placed.map((entry) => [entry.index, entry])).values()]
        .sort((a, b) => a.index - b.index);
      const axis = createOverrideAxis(count, defaultSize, unique);
      let previous = -1;
      for (let i = 0; i <= count; i++) {
        const offset = axis.getOffset(i);
        expect(offset, `offset ${i}`).toBeGreaterThan(previous);
        previous = offset;
        if (i < count) {
          expect(axis.indexAt(offset + (axis.getOffset(i + 1)! - offset) / 2)).toBe(i);
        }
      }
      for (let i = 0; i < count; i++) {
        expect(axis.indexAt(axis.getOffset(i)), `indexAt(offset(${i}))`).toBe(i);
      }
      for (const offset of [0, axis.extent / 3, axis.extent / 2, axis.extent - 1]) {
        const window = axis.getWindow(offset, 100);
        for (let i = window.start; i < window.end; i++) {
          expect(axis.getOffset(i), `window row ${i} starts before the clip`).toBeLessThan(offset + 100);
          expect(axis.getOffset(i + 1), `window row ${i} ends after the clip`).toBeGreaterThan(offset);
        }
        // Overscan widens the same window, one row per side.
        const widened = axis.getWindow(offset, 100, 1);
        expect(widened.start).toBe(Math.max(window.start - 1, 0));
        expect(widened.end).toBe(Math.min(window.end + 1, count));
      }
    }
  });

  it("answers indexAt sentinels and out-of-range indices", () => {
    const axis = createOverrideAxis(10, 32, [{ index: 4, size: 64 }]);
    expect(axis.indexAt(-1)).toBe(-1);
    expect(axis.indexAt(Number.NaN)).toBe(-1);
    expect(axis.indexAt(Number.POSITIVE_INFINITY)).toBe(10);
    expect(axis.indexAt(axis.extent)).toBe(10);
    expect(axis.getSize(-1)).toBe(0);
    expect(axis.getSize(10)).toBe(0);
    expect(axis.getOffset(-5)).toBe(0);
    expect(axis.getOffset(99)).toBe(axis.extent);
    expect(() => axis.getOffset(1.5)).toThrow(RangeError);
    expect(() => axis.getSize(Number.NaN)).toThrow(RangeError);
  });
});

describe("createOverrideAxis — flat parity and flags", () => {
  it("equals the fixed axis for every query when nothing is placed", () => {
    const cases: Array<[number, number]> = [[0, 32], [1, 32], [1000, 32], [40, 32.5], [3, 0.5]];
    for (const [count, size] of cases) {
      const fixed = createFixedAxis(count, size);
      const override = createOverrideAxis(count, size, []);
      expect(override.count).toBe(fixed.count);
      expect(override.extent).toBe(fixed.extent);
      expect(override.uniformSize).toBeUndefined();
      expect(override.minSize).toBe(size);
      for (let i = 0; i <= count; i++) {
        expect(override.getOffset(i)).toBe(fixed.getOffset(i));
      }
      for (let i = 0; i < count; i++) {
        expect(override.getSize(i)).toBe(fixed.getSize(i));
      }
      for (const offset of [0, size / 3, size, count * size - 1, count * size]) {
        expect(override.indexAt(offset)).toBe(fixed.indexAt(offset));
        expect(override.getWindow(offset, 96, 2)).toEqual(fixed.getWindow(offset, 96, 2));
      }
    }
  });

  it("is bit-identical to the fixed axis before the first placed row", () => {
    const count = 1000;
    const fixed = createFixedAxis(count, 32);
    const override = createOverrideAxis(count, 32, [{ index: 500, size: 8.5 }]);
    for (let i = 0; i < 500; i++) {
      expect(override.getOffset(i)).toBe(fixed.getOffset(i));
      expect(override.getSize(i)).toBe(32);
    }
    expect(override.getOffset(500)).toBe(fixed.getOffset(500));
    for (const offset of [0, 32, 100.5, 500 * 32 - 1, 500 * 32]) {
      expect(override.indexAt(offset)).toBe(fixed.indexAt(offset));
    }
    expect(override.extent).toBe(500 * 32 + 8.5 + 499 * 32);
  });

  it("reports minSize from the default and the placed sizes", () => {
    expect(createOverrideAxis(10, 32, []).minSize).toBe(32);
    expect(createOverrideAxis(10, 32, [{ index: 1, size: 64 }]).minSize).toBe(32);
    expect(createOverrideAxis(10, 32, [{ index: 1, size: 8.5 }, { index: 5, size: 96 }]).minSize).toBe(8.5);
    expect(createOverrideAxis(10, 32, [{ index: 1, size: 8.5 }]).uniformSize).toBeUndefined();
  });
});

describe("createOverrideAxis — validation and cost", () => {
  it("rejects unsorted, duplicate, out-of-range and invalid entries", () => {
    expect(() => createOverrideAxis(10, 32, [{ index: 5, size: 64 }, { index: 2, size: 64 }])).toThrow(RangeError);
    expect(() => createOverrideAxis(10, 32, [{ index: 5, size: 64 }, { index: 5, size: 96 }])).toThrow(RangeError);
    expect(() => createOverrideAxis(10, 32, [{ index: 10, size: 64 }])).toThrow(RangeError);
    expect(() => createOverrideAxis(10, 32, [{ index: -1, size: 64 }])).toThrow(RangeError);
    expect(() => createOverrideAxis(10, 32, [{ index: 1.5, size: 64 }])).toThrow(RangeError);
    expect(() => createOverrideAxis(10, 32, [{ index: 1, size: 0 }])).toThrow(RangeError);
    expect(() => createOverrideAxis(10, 32, [{ index: 1, size: -4 }])).toThrow(RangeError);
    expect(() => createOverrideAxis(10, 32, [{ index: 1, size: Number.NaN }])).toThrow(RangeError);
    expect(() => createOverrideAxis(10, 32, [{ index: 1, size: Number.POSITIVE_INFINITY }])).toThrow(RangeError);
    expect(() => createOverrideAxis(1.5, 32, [])).toThrow(RangeError);
    expect(() => createOverrideAxis(-1, 32, [])).toThrow(RangeError);
    expect(() => createOverrideAxis(10, 0, [])).toThrow(RangeError);
  });

  it("constructs without iterating the row count (AC-006-02)", () => {
    const started = performance.now();
    const axis = createOverrideAxis(1e12, 32, [
      { index: 0, size: 64 },
      { index: 5e11, size: 8.5 },
      { index: 1e12 - 1, size: 96 },
    ]);
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(50);
    expect(axis.count).toBe(1e12);
    expect(axis.extent).toBe(1e12 * 32 + 32 + (8.5 - 32) + 64);
    expect(axis.indexAt(5e11 * 32 + 32)).toBe(5e11);
    expect(axis.getSize(1e12 - 1)).toBe(96);
    expect(axis.getWindow(axis.extent, 320)).toEqual({ start: 1e12, end: 1e12 });
  });
});
