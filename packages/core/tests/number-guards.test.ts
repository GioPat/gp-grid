import { describe, expect, it } from "vitest";
import {
  clampCount,
  normalizeCount,
  normalizePositiveInteger,
  normalizeSize,
} from "../src/utils/number-guards";

const invalid = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

describe("number guards", () => {
  it("floors positive integers and falls back to 1", () => {
    expect(normalizePositiveInteger(1)).toBe(1);
    expect(normalizePositiveInteger(7.9)).toBe(7);
    for (const value of [0, 0.5, -3, ...invalid]) expect(normalizePositiveInteger(value)).toBe(1);
  });

  it("keeps positive sizes and falls back to 0", () => {
    expect(normalizeSize(12.5)).toBe(12.5);
    for (const value of [0, -1, ...invalid]) expect(normalizeSize(value)).toBe(0);
  });

  it("truncates counts and falls back to 0", () => {
    expect(normalizeCount(3.7)).toBe(3);
    for (const value of [0, -2, ...invalid]) expect(normalizeCount(value)).toBe(0);
  });

  it("clamps counts into [0, count]", () => {
    expect(clampCount(2.9, 5)).toBe(2);
    expect(clampCount(-4, 5)).toBe(0);
    expect(clampCount(9, 5)).toBe(5);
    expect(clampCount(Number.NaN, 5)).toBe(0);
    expect(clampCount(Number.POSITIVE_INFINITY, 5)).toBe(0);
  });
});
