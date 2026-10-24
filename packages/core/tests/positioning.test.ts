import { describe, expect, it } from "vitest";
import {
  calculateColumnPositions,
  findColumnAtX,
  getTotalWidth,
} from "../src/utils/positioning";
import type { ColumnDefinition } from "../src/types";

const column = (width: number, extra: Partial<ColumnDefinition> = {}): ColumnDefinition =>
  ({ field: `f${width}`, cellDataType: "text", width, ...extra }) as ColumnDefinition;

describe("calculateColumnPositions", () => {
  it("builds prefix positions and keeps hidden entries", () => {
    const positions = calculateColumnPositions([
      column(100),
      column(50, { hidden: true }),
      column(200),
    ]);
    expect(positions).toEqual([0, 100, 150, 350]);
    expect(getTotalWidth(positions)).toBe(350);
  });

  it("returns a single zero entry for no columns", () => {
    expect(calculateColumnPositions([])).toEqual([0]);
    expect(getTotalWidth([0])).toBe(0);
    expect(getTotalWidth([])).toBe(0);
  });

  it("accumulates fractional widths", () => {
    const positions = calculateColumnPositions([column(0.5), column(12.25)]);
    expect(positions).toEqual([0, 0.5, 12.75]);
  });

  it("rejects invalid widths instead of applying a grid fallback", () => {
    expect(() => calculateColumnPositions([column(0)])).toThrow(RangeError);
    expect(() => calculateColumnPositions([column(Number.NaN)])).toThrow(RangeError);
  });
});

describe("findColumnAtX", () => {
  const positions = [0, 100, 250, 370];

  it("resolves half-open edges", () => {
    expect(findColumnAtX(0, positions)).toBe(0);
    expect(findColumnAtX(99.999, positions)).toBe(0);
    expect(findColumnAtX(100, positions)).toBe(1);
    expect(findColumnAtX(249.5, positions)).toBe(1);
    expect(findColumnAtX(250, positions)).toBe(2);
    expect(findColumnAtX(369.9, positions)).toBe(2);
  });

  it("clamps before the first column and at or past the end", () => {
    expect(findColumnAtX(-10, positions)).toBe(0);
    expect(findColumnAtX(370, positions)).toBe(2);
    expect(findColumnAtX(10_000, positions)).toBe(2);
  });

  it("returns -1 for an empty position list", () => {
    expect(findColumnAtX(42, [])).toBe(-1);
    expect(findColumnAtX(42, [0])).toBe(-1);
  });

  it("returns -1 for a NaN coordinate", () => {
    expect(findColumnAtX(Number.NaN, positions)).toBe(-1);
  });
});
