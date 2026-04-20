// packages/core/tests/sort-filter-distinct-values.test.ts
// Regression: getDistinctValuesForColumn scanned cachedRows in insertion
// order, which after a sort is the sorted order, so the first 100k rows
// covered only the "smallest" values of the column. On 1.5M rows this
// meant the filter popup showed only the beginning of the alphabet.
// The fix stride-samples across the full dataset; these tests guard it.

import { describe, it, expect } from "vitest";
import { SortFilterManager } from "../src/managers/sort-filter-manager";
import type { ColumnDefinition } from "../src/types";

interface Row {
  id: number;
  color: string;
}

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 80 },
  { field: "color", cellDataType: "text", width: 120 },
];

/**
 * Build a cachedRows map whose iteration order matches what GridCore
 * produces after a fetch: keys 0..n-1, values inserted in index order.
 * When the rows are already sorted by `color`, the first N rows hold the
 * smallest values — exactly the pathological case for the old scan.
 */
const buildSortedByColor = (rowCount: number, colors: string[]): Map<number, Row> => {
  const perColor = Math.ceil(rowCount / colors.length);
  const map = new Map<number, Row>();
  let idx = 0;
  for (const color of colors) {
    for (let i = 0; i < perColor && idx < rowCount; i++, idx++) {
      map.set(idx, { id: idx, color });
    }
  }
  return map;
};

const buildManager = (cachedRows: Map<number, Row>): SortFilterManager<Row> => {
  const mgr = new SortFilterManager<Row>({
    getColumns: () => columns,
    isSortingEnabled: () => true,
    getCachedRows: () => cachedRows,
    onSortFilterChange: async () => {},
    onDataRefreshed: () => {},
  });
  return mgr;
};

describe("getDistinctValuesForColumn — stride sampling under sort", () => {
  it("returns values spanning the full range when data is sorted and exceeds maxScanRows", () => {
    // 10 colors, 150,000 rows. After sort: first 15,000 rows all have "aaa",
    // next 15,000 all have "bbb", etc. A sequential scan capped at 100,000
    // rows would see only the first ~7 colors and miss the last 3.
    const colors = ["aaa", "bbb", "ccc", "ddd", "eee", "fff", "ggg", "hhh", "iii", "jjj"];
    const cachedRows = buildSortedByColor(150_000, colors);
    const mgr = buildManager(cachedRows);

    const distinct = mgr.getDistinctValuesForColumn("color", 500, 100_000);

    // Must contain the very last color — which sat at rows 135,000+ and
    // would be invisible to the old sequential scan.
    expect(distinct).toContain("jjj");
    // And still cover the beginning for sanity.
    expect(distinct).toContain("aaa");
    // Full coverage: 10 distinct colors.
    expect(distinct).toHaveLength(10);
  });

  it("small datasets (total <= maxScanRows) still see every row", () => {
    // Stride = 1 when total <= cap; no sampling needed.
    const cachedRows = buildSortedByColor(100, ["a", "b", "c"]);
    const mgr = buildManager(cachedRows);
    const distinct = mgr.getDistinctValuesForColumn("color", 500, 100_000);
    expect(distinct).toEqual(["a", "b", "c"]);
  });

  it("honors maxValues cap", () => {
    // 200 colors, 50,000 rows (below scan cap). maxValues=50 should cut short.
    const colors = Array.from({ length: 200 }, (_, i) => `c${String(i).padStart(3, "0")}`);
    const cachedRows = buildSortedByColor(50_000, colors);
    const mgr = buildManager(cachedRows);
    const distinct = mgr.getDistinctValuesForColumn("color", 50, 100_000);
    expect(distinct.length).toBe(50);
  });

  it("unknown column returns empty", () => {
    const mgr = buildManager(new Map());
    expect(mgr.getDistinctValuesForColumn("nonexistent")).toEqual([]);
  });

  it("results are sorted with natural/numeric collation", () => {
    // "c10" should come after "c2" under numeric collation, not before it
    // (lexicographic would put c10 before c2).
    const cachedRows = buildSortedByColor(30, ["c2", "c10", "c1"]);
    const mgr = buildManager(cachedRows);
    const distinct = mgr.getDistinctValuesForColumn("color");
    expect(distinct).toEqual(["c1", "c2", "c10"]);
  });
});
