import { describe, expect, it } from "vitest";
import {
  getRowRegionPosition,
  getSuffixAnchorIndex,
  getSuffixAnchorOffset,
  getSuffixRowViewportTop,
  getSuffixViewportHeight,
  getSuffixWindow,
  getSuffixWrapperOffset,
} from "../src/geometry/row-regions-mapping";
import type { AxisWindow, VirtualAxis } from "../src/geometry/virtual-axis";
import { createHarness, frameInput } from "./row-regions-harness";

/** Independent scan of the rows intersecting the clip, widened by overscan. */
const linearWindow = (
  axis: VirtualAxis,
  offset: number,
  viewportExtent: number,
  overscan: number,
  frozenCount: number,
): AxisWindow => {
  const clamp = (value: number): number => Math.min(Math.max(value, 0), axis.count);
  const finish = (start: number, end: number): AxisWindow => {
    const bounded = Math.max(start, frozenCount);
    return { start: bounded, end: Math.max(end, bounded) };
  };
  if (Number.isFinite(offset) === false || Number.isFinite(viewportExtent) === false || viewportExtent <= 0) {
    const anchored = clamp(axis.indexAt(offset));
    return finish(anchored, anchored);
  }
  const endOffset = Math.min(offset + viewportExtent, axis.extent);
  let first = -1;
  let last = -1;
  for (let row = 0; row < axis.count; row++) {
    if (axis.getOffset(row) < endOffset && axis.getOffset(row + 1) > offset) {
      if (first < 0) first = row;
      last = row;
    }
  }
  if (first < 0) {
    const anchored = clamp(axis.indexAt(offset));
    return finish(anchored, anchored);
  }
  return finish(Math.max(first - overscan, 0), Math.min(last + 1 + overscan, axis.count));
};

const createRandom = (seed: number) => {
  let state = seed >>> 0;
  return (limit: number): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state % limit;
  };
};

const pick = <T>(random: (limit: number) => number, values: readonly T[]): T =>
  values[random(values.length)]!;

describe("row region mapping windows", () => {
  it("matches a linear oracle over seeded configurations", () => {
    const random = createRandom(20260922);
    for (let sample = 0; sample < 60; sample++) {
      const rowCount = random(61);
      const rowHeight = pick(random, [8, 10, 32]);
      const viewportHeight = pick(random, [0, 32, 50, 64, 100, 320]);
      const frozenCount = random(rowCount + 1);
      const overscan = pick(random, [0, 1, 3]);
      const ratio = pick(random, [undefined, 0.01]);
      const maxScroll = Math.max(0, rowCount * rowHeight - viewportHeight);
      const domScrollTop = random(maxScroll + 1);
      const harness = createHarness({ rowCount, rowHeight, viewportHeight, domScrollTop, overscan, ratio });
      const input = frameInput(harness, { frozenCount, overscan });
      const clipHeight = getSuffixViewportHeight(input);
      const logicalTop = harness.mapper.toLogicalScrollTop(domScrollTop);
      const expected = linearWindow(harness.axis, logicalTop + input.frozenExtent, clipHeight, overscan, frozenCount);
      const window = getSuffixWindow(input);

      expect(window).toEqual(expected);
      expect(window.start).toBeGreaterThanOrEqual(frozenCount);
      expect(window.end).toBeLessThanOrEqual(rowCount);
      const clipStart = logicalTop + input.frozenExtent;
      const clipEnd = clipStart + clipHeight;
      for (let row = frozenCount; clipHeight > 0 && row < rowCount; row++) {
        const inClip = harness.axis.getOffset(row) < clipEnd && harness.axis.getOffset(row + 1) > clipStart;
        if (inClip) {
          expect(row).toBeGreaterThanOrEqual(window.start);
          expect(row).toBeLessThan(window.end);
        }
      }
    }
  });

  it("holds the A7 invariant for suffix rows at 10,000,000 rows", () => {
    const anchors = new Set<number>();
    for (const domScrollTop of [0, 0.001, 0.032, 1, 5, 100, 1000, 100_000, 319_999.68]) {
      const harness = createHarness({
        rowCount: 10_000_000,
        rowHeight: 32,
        viewportHeight: 320,
        domScrollTop,
        ratio: 0.001,
        overscan: 3,
      });
      const input = frameInput(harness, { frozenCount: 3, overscan: 3 });
      const logicalTop = harness.mapper.toLogicalScrollTop(domScrollTop);
      const window = getSuffixWindow(input);
      const anchor = Math.max(harness.axis.indexAt(logicalTop + input.frozenExtent), input.frozenCount);
      anchors.add(getSuffixAnchorIndex(input));
      expect(getSuffixAnchorIndex(input)).toBe(anchor);
      expect(getSuffixAnchorOffset(input)).toBe(harness.axis.getOffset(anchor));
      expect(window.start).toBeGreaterThanOrEqual(3);
      const wrongAnchor = anchor + 7;
      for (const rowIndex of [window.start, window.start + 1, window.end - 1]) {
        const wrapperOffset = getSuffixWrapperOffset(input);
        const wrongOffset = harness.axis.getOffset(wrongAnchor);
        expect(getSuffixRowViewportTop(input, rowIndex))
          .toBeCloseTo(harness.axis.getOffset(rowIndex) - logicalTop, 3);
        expect(wrapperOffset + getRowRegionPosition(input, rowIndex) - input.scrollTop)
          .toBeCloseTo(harness.axis.getOffset(rowIndex) - logicalTop, 3);
        expect(wrapperOffset + harness.axis.getOffset(rowIndex) - wrongOffset - input.scrollTop)
          .not.toBeCloseTo(harness.axis.getOffset(rowIndex) - logicalTop, 3);
      }
      expect([getRowRegionPosition(input, 0), getRowRegionPosition(input, 2)]).toEqual([0, 64]);
    }
    expect(anchors.size).toBeGreaterThan(1);
  });

  it("has no suffix discontinuity as the first suffix row passes the block", () => {
    const options = { rowCount: 10_000_000, rowHeight: 32, viewportHeight: 320, ratio: 0.001, overscan: 0 };
    const before = frameInput(createHarness({ ...options, domScrollTop: 0.991999 }), { frozenCount: 3 });
    const after = frameInput(createHarness({ ...options, domScrollTop: 0.992001 }), { frozenCount: 3 });
    expect(getSuffixAnchorIndex(before)).toBe(33);
    expect(getSuffixAnchorIndex(after)).toBe(34);
    const rowIndex = 40;
    expect(getSuffixRowViewportTop(before, rowIndex) - getSuffixRowViewportTop(after, rowIndex))
      .toBeCloseTo(0.002, 3);
  });
});
