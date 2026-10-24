// packages/core/tests/classNames.test.ts

import { describe, expect, it } from "vitest";
import { isRowVisible } from "../src/utils/classNames";

const SUFFIX = { start: 10, end: 20 };
const EMPTY = { start: 0, end: -1 };

describe("isRowVisible", () => {
  it("answers the suffix range when no frozen rows are published", () => {
    expect(isRowVisible(10, SUFFIX)).toBe(true);
    expect(isRowVisible(20, SUFFIX)).toBe(true);
    expect(isRowVisible(9, SUFFIX)).toBe(false);
    expect(isRowVisible(21, SUFFIX)).toBe(false);
  });

  it("shows every row while the range is not initialized", () => {
    expect(isRowVisible(-1, null)).toBe(true);
    expect(isRowVisible(0, null)).toBe(true);
    expect(isRowVisible(9_999, null)).toBe(true);
  });

  it("hides every row for the empty range", () => {
    expect(isRowVisible(0, EMPTY)).toBe(false);
    expect(isRowVisible(5, EMPTY)).toBe(false);
  });

  it("keeps frozen rows visible for any suffix range, including the empty one", () => {
    expect(isRowVisible(0, EMPTY, 3)).toBe(true);
    expect(isRowVisible(2, EMPTY, 3)).toBe(true);
    expect(isRowVisible(3, EMPTY, 3)).toBe(false);

    expect(isRowVisible(2, { start: 50, end: 60 }, 3)).toBe(true);
    expect(isRowVisible(3, { start: 50, end: 60 }, 3)).toBe(false);
  });

  it("keeps `null` meaning everything with a frozen prefix", () => {
    expect(isRowVisible(0, null, 3)).toBe(true);
    expect(isRowVisible(500, null, 3)).toBe(true);
  });

  it("treats an omitted count as zero", () => {
    expect(isRowVisible(0, EMPTY, 0)).toBe(false);
    expect(isRowVisible(0, EMPTY)).toBe(false);
  });
});
