import { describe, expect, it } from "vitest";
import { createFixedAxis } from "../src/geometry/fixed-axis";
import {
  blocksOfRange,
  getRequiredPageRanges,
  getWindowPageBlocks,
  unionSize,
} from "../src/managers/page-blocks";

const axis = createFixedAxis(1000, 32);
const base = { axis, pageSize: 100, viewportHeight: 320, frozenCount: 0 };

describe("page blocks", () => {
  it("lists the blocks of a range and none for a missing one", () => {
    expect(blocksOfRange({ start: 2, end: 5 })).toEqual([2, 3, 4]);
    expect(blocksOfRange(null)).toEqual([]);
  });

  it("maps a row window to its blocks and an empty window to none", () => {
    expect(getWindowPageBlocks({ start: 95, end: 205 }, 100)).toEqual([0, 1, 2]);
    expect(getWindowPageBlocks({ start: 10, end: 10 }, 100)).toEqual([]);
    // An invalid page size falls back to one row per page.
    expect(getWindowPageBlocks({ start: 3, end: 5 }, 0)).toEqual([3, 4]);
  });

  it("merges touching ranges and keeps apart ranges separate", () => {
    expect(unionSize(null, { start: 1, end: 3 })).toBe(2);
    expect(unionSize({ start: 0, end: 2 }, null)).toBe(2);
    expect(unionSize(null, null)).toBe(0);
    expect(unionSize({ start: 0, end: 2 }, { start: 2, end: 4 })).toBe(4);
    expect(unionSize({ start: 0, end: 1 }, { start: 5, end: 7 })).toBe(3);
  });

  it("reports the prefix, the suffix and the gap between them", () => {
    const ranges = getRequiredPageRanges({ ...base, frozenCount: 3, scrollTop: 500 * 32 });
    expect(ranges.prefix).toEqual({ start: 0, end: 1 });
    expect(ranges.suffix).toEqual({ start: 5, end: 6 });
    expect(ranges.gap).toEqual({ start: 1, end: 5 });
  });

  it("treats a non-finite or negative scroll top as the top of the grid", () => {
    for (const scrollTop of [Number.NaN, Number.POSITIVE_INFINITY, -50]) {
      expect(getRequiredPageRanges({ ...base, scrollTop }).suffix).toEqual({ start: 0, end: 1 });
    }
  });

  it("has no suffix when the frozen rows fill the viewport", () => {
    const ranges = getRequiredPageRanges({ ...base, frozenCount: 10, scrollTop: 0 });
    expect(ranges).toEqual({ prefix: { start: 0, end: 1 }, suffix: null, gap: null });
  });
});
