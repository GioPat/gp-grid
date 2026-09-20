import { describe, expect, it } from "vitest";
import { clampIndex, searchOffsets } from "../src/geometry/offsets";

describe("searchOffsets", () => {
  const offsets = [0, 100, 250, 370];

  it("finds the last edge at or before the offset", () => {
    expect(searchOffsets(offsets, 0)).toBe(0);
    expect(searchOffsets(offsets, 99.9)).toBe(0);
    expect(searchOffsets(offsets, 100)).toBe(1);
    expect(searchOffsets(offsets, 369.9)).toBe(2);
    expect(searchOffsets(offsets, 370)).toBe(3);
    expect(searchOffsets(offsets, 10_000)).toBe(3);
  });

  it("answers -1 before the first edge, for NaN and for an empty list", () => {
    expect(searchOffsets(offsets, -0.1)).toBe(-1);
    expect(searchOffsets([50, 80], 49)).toBe(-1);
    expect(searchOffsets(offsets, Number.NaN)).toBe(-1);
    expect(searchOffsets([], 5)).toBe(-1);
    expect(searchOffsets([], -5)).toBe(-1);
  });
});

describe("clampIndex", () => {
  it("answers -1 for an empty axis", () => {
    expect(clampIndex(3, 0)).toBe(-1);
    expect(clampIndex(3, -1)).toBe(-1);
  });

  it("truncates and clamps into [0, count]", () => {
    expect(clampIndex(2.9, 5)).toBe(2);
    expect(clampIndex(-0.5, 5)).toBe(0);
    expect(clampIndex(-3, 5)).toBe(0);
    expect(clampIndex(5, 5)).toBe(5);
    expect(clampIndex(9, 5)).toBe(5);
  });

  it("maps non-finite indices to the nearest end, NaN to 0", () => {
    expect(clampIndex(Number.POSITIVE_INFINITY, 5)).toBe(5);
    expect(clampIndex(Number.NEGATIVE_INFINITY, 5)).toBe(0);
    expect(clampIndex(Number.NaN, 5)).toBe(0);
  });
});
