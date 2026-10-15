// PRD 012 D5 tuples: the key tree, domains, pruning, order and each row's leaf tuple.

import { describe, expect, it } from "vitest";
import { buildPivotKeys, type PivotKeys, type PivotKeysResult } from "../src/pivot/pivot-keys";
import type { CellValue } from "../src/types";
import { objectSource } from "./row-grouping-source";
import { SALES } from "./pivot-sales";

const keysOf = (result: PivotKeysResult): PivotKeys => {
  if ("objectKey" in result) throw new Error(`object key at ${result.objectKey}`);
  return result;
};

const values = (field: string, list: CellValue[]) => objectSource(list.map((value) => ({ [field]: value })));

describe("buildPivotKeys", () => {
  it("one level orders keys ascending and maps every row", () => {
    const keys = keysOf(buildPivotKeys(objectSource(SALES), [{ field: "year" }]));
    expect(keys.tuples).toEqual([[["year", "n", 2024]], [["year", "n", 2025]]]);
    expect([...keys.tupleOf]).toEqual([0, 0, 0, 1, 0, 1, 1]);
  });

  it("two levels build the tuples per parent", () => {
    const keys = keysOf(buildPivotKeys(objectSource(SALES), [{ field: "year" }, { field: "quarter", id: "q" }]));
    expect(keys.tuples).toEqual([
      [["year", "n", 2024], ["q", "s", "Q1"]],
      [["year", "n", 2024], ["q", "s", "Q2"]],
      [["year", "n", 2025], ["q", "s", "Q1"]],
    ]);
    expect([...keys.tupleOf]).toEqual([0, 1, 0, 2, 1, 2, 2]);
    expect(keys.tupleIndex.size).toBe(3);
  });

  it("mixed types order by tag: number, date, boolean, string, then blanks", () => {
    const keys = keysOf(buildPivotKeys(values("k", ["b", 2, null, true, new Date(0), "a", 1]), [{ field: "k" }]));
    expect(keys.tuples.map((tuple) => tuple[0]!.slice(1))).toEqual([
      ["n", 1],
      ["n", 2],
      ["d", 0],
      ["b", true],
      ["s", "a"],
      ["s", "b"],
      ["z", null],
    ]);
    expect([...keys.tupleOf]).toEqual([5, 1, 6, 3, 2, 4, 0]);
  });

  it("dates key by timestamp and never meet a number of the same value", () => {
    const keys = keysOf(buildPivotKeys(values("k", [new Date(5), 5, new Date(5), new Date(1)]), [{ field: "k" }]));
    expect(keys.tuples).toEqual([[["k", "n", 5]], [["k", "d", 1]], [["k", "d", 5]]]);
    expect([...keys.tupleOf]).toEqual([2, 0, 2, 1]);
  });

  it("toKey normalizes keys and an object without it is reported by dimension id", () => {
    const rows = values("at", [new Date(Date.UTC(2024, 1)), new Date(Date.UTC(2025, 3)), new Date(Date.UTC(2024, 9))]);
    const year = (value: CellValue) => (value as Date).getUTCFullYear();
    const keys = keysOf(buildPivotKeys(rows, [{ field: "at", id: "year", toKey: year }]));
    expect(keys.tuples).toEqual([[["year", "n", 2024]], [["year", "n", 2025]]]);
    expect([...keys.tupleOf]).toEqual([0, 1, 0]);
    const objects = objectSource([{ at: { x: 1 } as unknown as CellValue }]);
    expect(buildPivotKeys(objects, [{ field: "at", id: "when" }])).toEqual({ objectKey: "when" });
  });

  it("a domain keeps an unused key, in domain order, and drops rows outside it", () => {
    const keys = keysOf(buildPivotKeys(objectSource(SALES), [{ field: "year" }], { year: [2026, 2024, 2024] }));
    expect(keys.tuples).toEqual([[["year", "n", 2026]], [["year", "n", 2024]]]);
    expect([...keys.tupleOf]).toEqual([1, 1, 1, -1, 1, -1, -1]);
  });

  it("a domain on the second level repeats under every parent", () => {
    const keys = keysOf(buildPivotKeys(objectSource(SALES), [{ field: "year" }, { field: "quarter" }], {
      quarter: ["Q2", "Q1"],
    }));
    expect(keys.tuples.map((tuple) => tuple.map((step) => step[2]))).toEqual([
      [2024, "Q2"],
      [2024, "Q1"],
      [2025, "Q2"],
      [2025, "Q1"],
    ]);
    expect([...keys.tupleOf]).toEqual([1, 0, 1, 3, 0, 3, 3]);
  });

  it("a domain on the first level over a data-driven second prunes keys without rows", () => {
    const rows = [...SALES, { ...SALES[0]!, year: 2026 }];
    const keys = keysOf(buildPivotKeys(objectSource(rows), [{ field: "year" }, { field: "quarter" }], {
      year: [2023, 2025, 2024],
    }));
    expect(keys.tuples.map((tuple) => tuple.map((step) => step[2]))).toEqual([
      [2025, "Q1"],
      [2024, "Q1"],
      [2024, "Q2"],
    ]);
    expect([...keys.tupleOf]).toEqual([1, 2, 1, 0, 2, 0, 0, -1]);
  });

  it("no rows give no tuples", () => {
    const keys = keysOf(buildPivotKeys(objectSource([]), [{ field: "year" }, { field: "quarter" }]));
    expect(keys.tuples).toEqual([]);
    expect(keys.tupleOf.length).toBe(0);
  });
});
