import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIN_COLUMN_WIDTH,
  isUsableWidth,
  normalizeColumnWidth,
  resolveColumnWidths,
  type WidthSource,
} from "../src/geometry/column-widths";


const source = (columnId: string, width: number, overridden = false): WidthSource => ({
  columnId,
  width,
  overridden,
});

/**
 * Legacy proportional-scaling oracle, kept test-local now that
 * `calculateScaledColumnPositions` is no longer exported.
 */
const legacyWidths = (widths: number[], viewportWidth: number): number[] => {
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (viewportWidth <= total || total === 0) return [...widths];
  const scale = viewportWidth / total;
  return widths.map((width) => width * scale);
};

describe("normalizeColumnWidth", () => {
  it("keeps positive finite widths", () => {
    expect(normalizeColumnWidth(120)).toBe(120);
    expect(normalizeColumnWidth(0.5)).toBe(0.5);
  });

  it("falls back for non-positive and non-finite widths", () => {
    expect(normalizeColumnWidth(0)).toBe(DEFAULT_MIN_COLUMN_WIDTH);
    expect(normalizeColumnWidth(-10)).toBe(DEFAULT_MIN_COLUMN_WIDTH);
    expect(normalizeColumnWidth(Number.NaN)).toBe(DEFAULT_MIN_COLUMN_WIDTH);
    expect(normalizeColumnWidth(Number.POSITIVE_INFINITY)).toBe(DEFAULT_MIN_COLUMN_WIDTH);
    expect(isUsableWidth(1)).toBe(true);
    expect(isUsableWidth(Number.NaN)).toBe(false);
  });
});

describe("resolveColumnWidths — fit", () => {
  it("matches the legacy proportional oracle without overrides", () => {
    expect(resolveColumnWidths([source("a", 100), source("b", 100)], "fit", 300)).toEqual(
      legacyWidths([100, 100], 300),
    );
    expect(resolveColumnWidths([source("a", 80), source("b", 40)], "fit", 300)).toEqual(
      legacyWidths([80, 40], 300),
    );
    expect(
      resolveColumnWidths([source("a", 12.5), source("b", 7.5), source("c", 30)], "fit", 250),
    ).toEqual(legacyWidths([12.5, 7.5, 30], 250));
  });

  it("keeps base widths when the viewport is unknown or narrower", () => {
    const sources = [source("a", 100), source("b", 100)];
    expect(resolveColumnWidths(sources, "fit", 0)).toEqual([100, 100]);
    expect(resolveColumnWidths(sources, "fit", Number.NaN)).toEqual([100, 100]);
    expect(resolveColumnWidths(sources, "fit", 150)).toEqual([100, 100]);
    expect(resolveColumnWidths(sources, "fit", 200)).toEqual([100, 100]);
    // `fit` expands and never shrinks, even with an override in the mix.
    expect(
      resolveColumnWidths([source("a", 100, true), source("b", 100)], "fit", 150),
    ).toEqual([100, 100]);
  });

  it("keeps overrides exact and shares slack with the rest", () => {
    expect(resolveColumnWidths([source("a", 100, true), source("b", 100)], "fit", 300)).toEqual([
      100, 200,
    ]);
    expect(
      resolveColumnWidths([source("a", 100, true), source("b", 100, true)], "fit", 300),
    ).toEqual([100, 100]);
    const mixed = resolveColumnWidths(
      [source("a", 50, true), source("b", 100), source("c", 50)],
      "fit",
      400,
    );
    expect(mixed[0]).toBe(50);
    expect(mixed[1]).toBeCloseTo(233.3333333, 5);
    expect(mixed[2]).toBeCloseTo(116.6666667, 5);
    expect(mixed.reduce((total, width) => total + width, 0)).toBeCloseTo(400, 5);
  });

  it("leaves slack empty when every column is overridden or fixed", () => {
    expect(resolveColumnWidths([source("a", 100, true)], "fit", 500)).toEqual([100]);
    expect(resolveColumnWidths([source("a", 100), source("b", 100)], "fixed", 500)).toEqual([
      100, 100,
    ]);
  });

  it("normalizes invalid widths before fitting", () => {
    expect(resolveColumnWidths([source("a", 0), source("b", -5)], "fit", 0)).toEqual([50, 50]);
  });
});
