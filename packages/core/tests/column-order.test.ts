// packages/core/tests/column-order.test.ts

import { describe, expect, it } from "vitest";
import {
  clampIndexToRegion,
  flattenPartition,
  partitionByPin,
  regionBounds,
} from "../src/geometry/column-order";
import type { ColumnPin } from "../src/types/geometry";

const pins = (map: Record<string, ColumnPin>): ((id: string) => ColumnPin | null) =>
  (id) => map[id] ?? null;

describe("column-order partition", () => {
  it("keeps base order stable inside each region", () => {
    const base = ["a", "b", "c", "d", "e"];
    const partition = partitionByPin(base, pins({ b: "start", d: "start", e: "end" }));

    expect(partition).toEqual({
      start: ["b", "d"],
      center: ["a", "c"],
      end: ["e"],
    });
    expect(flattenPartition(partition)).toEqual(["b", "d", "a", "c", "e"]);
  });

  it("treats every column as center without pins", () => {
    const partition = partitionByPin(["a", "b"], () => null);
    expect(flattenPartition(partition)).toEqual(["a", "b"]);
    expect(regionBounds(partition, "center")).toEqual({ start: 0, end: 2 });
  });

  it("reports each region's bounds in the partitioned order", () => {
    const partition = partitionByPin(["a", "b", "c", "d"], pins({ a: "start", d: "end" }));
    expect(regionBounds(partition, "start")).toEqual({ start: 0, end: 1 });
    expect(regionBounds(partition, "center")).toEqual({ start: 1, end: 3 });
    expect(regionBounds(partition, "end")).toEqual({ start: 3, end: 4 });
  });

  it("clamps an order command into the column's own region", () => {
    const partition = partitionByPin(["a", "b", "c", "d"], pins({ a: "start", d: "end" }));

    expect(clampIndexToRegion(partition, "a", 3)).toBe(0);
    expect(clampIndexToRegion(partition, "b", 3)).toBe(2);
    expect(clampIndexToRegion(partition, "d", 0)).toBe(3);
    expect(clampIndexToRegion(partition, "missing", 0)).toBeNull();
  });

  it("unpinning returns a column to its base-order slot", () => {
    const base = ["a", "b", "c"];
    expect(flattenPartition(partitionByPin(base, pins({ c: "start" })))).toEqual(["c", "a", "b"]);
    expect(flattenPartition(partitionByPin(base, () => null))).toEqual(["a", "b", "c"]);
  });
});
