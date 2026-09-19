// packages/core/tests/distinct-values.test.ts

import { describe, it, expect } from "vitest";
import {
  accessReader,
  cachedRowReader,
  collectDistinctValues,
  normalizeDistinctValue,
  sortDistinctValues,
} from "../src/filtering/distinct-values";
import type { CellValue, RowAccess } from "../src/types";

const fromArray = (values: CellValue[]) => (index: number): CellValue | undefined => values[index];

describe("normalizeDistinctValue", () => {
  it("keeps scalars as they are and keys them by raw identity", () => {
    const [numberKey, numberValue] = normalizeDistinctValue(5);
    const [stringKey] = normalizeDistinctValue("5");

    expect(numberValue).toBe(5);
    expect(numberKey).not.toBe(stringKey);
  });

  it("gives arrays with the same members one key regardless of order", () => {
    const [left, sorted] = normalizeDistinctValue(["b", "a", "a", "c"]);
    const [right] = normalizeDistinctValue(["c", "a", "b", "a"]);

    expect(left).toBe(right);
    expect(sorted).toEqual(["a", "a", "b", "c"]);
  });

  it("does not reorder the caller's array", () => {
    const tags = ["b", "a"];
    normalizeDistinctValue(tags);
    expect(tags).toEqual(["b", "a"]);
  });
});

describe("collectDistinctValues", () => {
  it("deduplicates by raw identity and keeps first-seen order", () => {
    const values: CellValue[] = ["x", 1, "x", "1", 1, null];
    const scan = collectDistinctValues(values.length, fromArray(values), 10);

    expect(scan).toEqual({ values: ["x", 1, "1", null], truncated: false });
  });

  it("stops at the cap and reports truncation only when positions remain", () => {
    const values: CellValue[] = ["a", "b", "c"];

    expect(collectDistinctValues(3, fromArray(values), 2)).toEqual({
      values: ["a", "b"],
      truncated: true,
    });
    expect(collectDistinctValues(2, fromArray(values), 2)).toEqual({
      values: ["a", "b"],
      truncated: false,
    });
  });

  it("skips positions that hold nothing", () => {
    const rows = new Map<number, { color: string }>([
      [0, { color: "red" }],
      [2, { color: "blue" }],
    ]);
    const scan = collectDistinctValues(3, cachedRowReader(rows, "color"), 10);

    expect(scan.values).toEqual(["red", "blue"]);
  });

  it("reads a record-less source through its scalar access", () => {
    const access: RowAccess = {
      rowCount: 3,
      getValue: (row, field) => `${field}-${row % 2}`,
    };
    const scan = collectDistinctValues(access.rowCount, accessReader(access, "c"), 10);

    expect(scan.values).toEqual(["c-0", "c-1"]);
  });
});

describe("sortDistinctValues", () => {
  it("orders by display string, numerically and case-insensitively", () => {
    expect(sortDistinctValues(["b", "A", "10", "9"], undefined)).toEqual(["9", "10", "A", "b"]);
  });

  it("orders by the formatted label without mutating the input", () => {
    const input: CellValue[] = [1, 2, 3];
    const labels: Record<number, string> = { 1: "zeta", 2: "alpha", 3: "mid" };

    const sorted = sortDistinctValues(input, (value) => labels[value as number] ?? "");

    expect(sorted).toEqual([2, 3, 1]);
    expect(input).toEqual([1, 2, 3]);
  });
});
