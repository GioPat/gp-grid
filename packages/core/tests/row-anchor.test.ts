// packages/core/tests/row-anchor.test.ts

import { describe, expect, it } from "vitest";
import { createFixedAxis, createOverrideAxis, createRowMapper } from "../src/geometry";
import type { PlacedRowSize } from "../src/geometry";
import type { RowRegionMappingInput } from "../src/geometry";
import { captureRowAnchor, resolveAnchoredScrollTop } from "../src/geometry";
import type { RowMapper } from "../src/geometry";

const DEFAULT = 32;
const VIEWPORT = 320;

interface FrameOptions {
  count?: number;
  placed?: readonly PlacedRowSize[];
  ratio?: number;
  frozenCount?: number;
  viewportHeight?: number;
}

const createMapper = (ratio: number, maxLogical: number, domScrollTop: number): RowMapper =>
  createRowMapper({
    mapping: {
      getDomScrollTop: () => domScrollTop,
      toDomScrollTop: (logical) => logical * ratio,
      toLogicalScrollTop: (dom) => dom / ratio,
      isScalingActive: () => ratio !== 1,
      getMaxLogicalScrollTop: () => maxLogical,
    },
  });

/** Frame whose DOM sample is the logical top converted through `ratio`. */
const createFrame = (logicalTop: number, options: FrameOptions = {}): RowRegionMappingInput => {
  const count = options.count ?? 1_000;
  const placed = options.placed ?? [];
  const axis = placed.length === 0
    ? createFixedAxis(count, DEFAULT)
    : createOverrideAxis(count, DEFAULT, placed);
  const ratio = options.ratio ?? 1;
  const viewportHeight = options.viewportHeight ?? VIEWPORT;
  const frozenCount = options.frozenCount ?? 0;
  return {
    axis,
    mapper: createMapper(ratio, Math.max(0, axis.extent - viewportHeight), logicalTop * ratio),
    frozenCount,
    frozenExtent: axis.getOffset(frozenCount),
    viewportHeight,
    scrollTop: logicalTop * ratio,
  };
};

/** Clip top of the frame, in content coordinates. */
const clipTopOf = (frame: RowRegionMappingInput): number =>
  frame.mapper.toLogicalScrollTop(frame.scrollTop) + frame.frozenExtent;

describe("captureRowAnchor (D5)", () => {
  it("captures the suffix row under the clip top with its intra offset", () => {
    const frame = createFrame(3_210);
    const anchor = captureRowAnchor(frame);
    expect(anchor).toEqual({ index: 100, intra: 10 });
    expect(clipTopOf(frame)).toBe(3_210);
  });

  it("measures the clip top below the frozen block", () => {
    const frame = createFrame(3_000, { frozenCount: 3 });
    const anchor = captureRowAnchor(frame);
    expect(anchor).toEqual({ index: 96, intra: 24 });
  });

  it("has no anchor without a suffix clip, a suffix row or a row count", () => {
    expect(captureRowAnchor(createFrame(0, { count: 0 }))).toBeNull();
    expect(captureRowAnchor(createFrame(0, { count: 3, frozenCount: 3 }))).toBeNull();
    expect(captureRowAnchor(createFrame(0, { viewportHeight: 0 }))).toBeNull();
    expect(captureRowAnchor(createFrame(0, { frozenCount: 3, viewportHeight: 96 }))).toBeNull();
  });

  it("has no anchor when the clip top is past the last row", () => {
    expect(captureRowAnchor(createFrame(32_000, { count: 1_000 }))).toBeNull();
  });
});

describe("resolveAnchoredScrollTop (D5)", () => {
  it("keeps the anchor under the clip top when a row above grows", () => {
    const anchor = { index: 100, intra: 10 };
    const grown = createFrame(3_210, { placed: [{ index: 5, size: 96 }] });
    expect(resolveAnchoredScrollTop(anchor, grown)).toBe(3_274);
    expect(grown.axis.getOffset(100) - (3_274 - grown.frozenExtent)).toBe(-10);
  });

  it("keeps the anchor under the clip top when a row above shrinks", () => {
    const anchor = { index: 100, intra: 10 };
    const shrunk = createFrame(3_210, { placed: [{ index: 5, size: 16 }] });
    expect(resolveAnchoredScrollTop(anchor, shrunk)).toBe(3_194);
  });

  it("clamps the intra offset when the anchor row itself shrinks", () => {
    const anchor = { index: 100, intra: 30 };
    const shrunk = createFrame(3_210, { placed: [{ index: 100, size: 16 }] });
    // 3200 + 16: the clip top lands on the shrunken row's bottom edge.
    expect(resolveAnchoredScrollTop(anchor, shrunk)).toBe(3_216);
  });

  it("falls back to the last row when the anchor row left the axis", () => {
    const anchor = { index: 999, intra: 8 };
    const shorter = createFrame(1_000, { count: 100, viewportHeight: 32 });
    expect(resolveAnchoredScrollTop(anchor, shorter)).toBe(99 * 32);
  });

  it("falls back to the first suffix row when the anchor is now frozen", () => {
    const anchor = { index: 4, intra: 12 };
    const frozen = createFrame(100, { frozenCount: 8 });
    expect(resolveAnchoredScrollTop(anchor, frozen)).toBe(0);
  });

  it("leaves the logical top alone when a frozen row grows", () => {
    const before = createFrame(3_000, { frozenCount: 3 });
    const anchor = captureRowAnchor(before);
    expect(anchor).not.toBeNull();

    const after = createFrame(3_000, {
      frozenCount: 3,
      placed: [{ index: 1, size: 96 }],
    });
    expect(after.frozenExtent).toBe(160);
    // The current sample already restores the anchor: no correction.
    expect(resolveAnchoredScrollTop(anchor!, after)).toBeNull();
  });

  it("returns null for a zero clip, an empty suffix and an unchanged sample", () => {
    const anchor = { index: 100, intra: 10 };
    expect(resolveAnchoredScrollTop(anchor, createFrame(3_210, { viewportHeight: 0 }))).toBeNull();
    expect(resolveAnchoredScrollTop(anchor, createFrame(0, { count: 0 }))).toBeNull();
    expect(
      resolveAnchoredScrollTop(anchor, createFrame(3_210, { count: 3, frozenCount: 3 })),
    ).toBeNull();
    expect(resolveAnchoredScrollTop(anchor, createFrame(3_210))).toBeNull();
  });

  it("resolves through the compressed mapping of the post-change frame", () => {
    const anchor = captureRowAnchor(createFrame(3_210));
    const compressed = createFrame(3_210, {
      ratio: 0.01,
      placed: [{ index: 5, size: 96 }],
    });
    const expected = compressed.mapper.toDomScrollTopClamped(3_274);
    expect(resolveAnchoredScrollTop(anchor!, compressed)).toBe(expected);
  });
});
