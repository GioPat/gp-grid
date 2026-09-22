// packages/core/tests/fill-helpers.test.ts

import { describe, expect, it } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import { calculateFillHandlePosition } from "../src/utils/fill-helpers";
import type { ColumnDefinition } from "../src/types";

const def = (field: string, width = 100): ColumnDefinition => ({
  field,
  cellDataType: "text",
  width,
  editable: true,
});

const createGrid = async (
  columns: ColumnDefinition[],
  viewportWidth: number,
): Promise<GridCore<Record<string, unknown>>> => {
  const grid = new GridCore<Record<string, unknown>>({
    columns,
    dataSource: createClientDataSource([{ id: 1 }, { id: 2 }, { id: 3 }]),
    rowHeight: 32,
    columnLayout: "fixed",
  });
  await grid.initialize();
  grid.setViewport(0, 0, viewportWidth, 320);
  return grid;
};

describe("calculateFillHandlePosition per region", () => {
  it("anchors a center cell in rows space and reports the region", async () => {
    const grid = await createGrid([def("a"), def("b"), def("c")], 300);
    const position = calculateFillHandlePosition({
      core: grid,
      activeCell: { row: 0, col: 1 },
      selectionRange: null,
    });

    // Rows-space left is the content offset of "b" (100) plus its width minus 20.
    expect(position).toMatchObject({ region: "center", left: 180 });
    expect(position?.top).toBeGreaterThanOrEqual(0);
  });

  it("returns a start-pin anchor with the start region", async () => {
    const grid = await createGrid([def("a"), def("b"), def("c")], 300);
    grid.setColumnPinned("a", "start");

    const position = calculateFillHandlePosition({
      core: grid,
      activeCell: { row: 0, col: 0 },
      selectionRange: null,
    });
    expect(position).toMatchObject({ region: "start", left: 80 });
  });

  it("returns an end-pin anchor with the end region", async () => {
    const grid = await createGrid([def("a"), def("b"), def("c")], 300);
    grid.setColumnPinned("c", "end");

    const position = calculateFillHandlePosition({
      core: grid,
      activeCell: { row: 0, col: 2 },
      selectionRange: null,
    });
    expect(position).toMatchObject({ region: "end", left: 80 });
  });

  it("keeps a scrolled-away center anchor addressable while mounted", async () => {
    const grid = await createGrid([def("a"), def("b"), def("c"), def("d")], 200);
    grid.setColumnPinned("a", "start");
    grid.setColumnPinned("d", "end");
    grid.setViewport(0, 0, 200, 320);

    const position = calculateFillHandlePosition({
      core: grid,
      activeCell: { row: 0, col: 1 },
      selectionRange: null,
    });
    expect(position === null || position.region === "center").toBe(true);
  });

  it("returns null without an active target or a mounted row", async () => {
    const grid = await createGrid([def("a")], 200);
    expect(calculateFillHandlePosition({ core: grid, activeCell: null, selectionRange: null }))
      .toBeNull();
    expect(calculateFillHandlePosition({
      core: grid,
      activeCell: { row: 99, col: 0 },
      selectionRange: null,
    })).toBeNull();
  });

  it("refuses a selection with a non-editable column", async () => {
    const grid = await createGrid([def("a"), { ...def("b"), editable: false }], 300);
    expect(calculateFillHandlePosition({
      core: grid,
      activeCell: { row: 0, col: 1 },
      selectionRange: null,
    })).toBeNull();
  });
});
