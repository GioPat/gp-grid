import { describe, expect, it } from "vitest";
import { computeColumnLayout } from "../src/utils/column-layout";
import type { ColumnDefinition } from "../src/types";

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 50, pinned: "left" },
  { field: "name", cellDataType: "text", width: 150 },
  { field: "age", cellDataType: "number", width: 80, pinned: "right" },
  { field: "hidden", cellDataType: "text", width: 100, hidden: true },
];

describe("computeColumnLayout", () => {
  it("splits visible columns into pinned and center regions", () => {
    const layout = computeColumnLayout(columns);

    expect(layout.leftPinned.items.map((item) => item.originalIndex)).toEqual([0]);
    expect(layout.center.items.map((item) => item.originalIndex)).toEqual([1]);
    expect(layout.rightPinned.items.map((item) => item.originalIndex)).toEqual([2]);
    expect(layout.totalWidth).toBe(280);
  });

  it("preserves original and visible indexes for hit testing", () => {
    const layout = computeColumnLayout(columns);

    expect(layout.items.map((item) => item.visibleIndex)).toEqual([0, 1, 2]);
    expect(layout.items.map((item) => item.originalIndex)).toEqual([0, 1, 2]);
  });
});
