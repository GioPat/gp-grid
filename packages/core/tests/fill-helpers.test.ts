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
  rowCount = 3,
): Promise<GridCore<Record<string, unknown>>> => {
  const data = Array.from({ length: rowCount }, (_, id) => ({ id }));
  const grid = new GridCore<Record<string, unknown>>({
    columns,
    dataSource: createClientDataSource(data),
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
    grid.columns.setPinned("a", "start");

    const position = calculateFillHandlePosition({
      core: grid,
      activeCell: { row: 0, col: 0 },
      selectionRange: null,
    });
    expect(position).toMatchObject({ region: "start", left: 80 });
  });

  it("returns an end-pin anchor with the end region", async () => {
    const grid = await createGrid([def("a"), def("b"), def("c")], 300);
    grid.columns.setPinned("c", "end");

    const position = calculateFillHandlePosition({
      core: grid,
      activeCell: { row: 0, col: 2 },
      selectionRange: null,
    });
    expect(position).toMatchObject({ region: "end", left: 80 });
  });

  it("keeps a scrolled-away center anchor addressable while mounted", async () => {
    const grid = await createGrid([def("a"), def("b"), def("c"), def("d")], 200);
    grid.columns.setPinned("a", "start");
    grid.columns.setPinned("d", "end");
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

describe("calculateFillHandlePosition row regions", () => {
  it("reports a frozen anchor with frozen-local coordinates", async () => {
    const grid = await createGrid([def("a"), def("b"), def("c")], 300, 8);
    grid.setFrozenRowsRequest({ requestedCount: 3 });

    const positions = [0, 1, 2].map((row) =>
      calculateFillHandlePosition({
        core: grid,
        activeCell: { row, col: 1 },
        selectionRange: null,
      }),
    );
    expect(positions.map((position) => position?.rowRegion)).toEqual([
      "frozen",
      "frozen",
      "frozen",
    ]);
    // `top` is frozen-local: rows 0/1/2 occupy 0/32/64, the handle sits 5 px up.
    expect([0, 1, 2].map((row) => grid.geometry.getCellBounds(row, 1, "rows")?.top))
      .toEqual([0, 32, 64]);
    expect(positions.map((position) => position?.top)).toEqual([27, 59, 91]);
    expect(positions.map((position) => position?.left)).toEqual([180, 180, 180]);
  });

  it("keeps a frozen pin's region-local left", async () => {
    const grid = await createGrid([def("a"), def("b"), def("c")], 300, 8);
    grid.setFrozenRowsRequest({ requestedCount: 3 });
    grid.columns.setPinned("a", "start");

    const position = calculateFillHandlePosition({
      core: grid,
      activeCell: { row: 1, col: 0 },
      selectionRange: null,
    });
    expect(position).toMatchObject({ rowRegion: "frozen", region: "start", left: 80, top: 59 });
  });

  it("keeps a suffix anchor's region and today's coordinates", async () => {
    const grid = await createGrid([def("a"), def("b"), def("c")], 300, 8);
    grid.setFrozenRowsRequest({ requestedCount: 3 });

    const position = calculateFillHandlePosition({
      core: grid,
      activeCell: { row: 3, col: 1 },
      selectionRange: null,
    });
    expect(position).toMatchObject({ rowRegion: "suffix", region: "center", top: 123, left: 180 });
  });

  it("keeps count 0's payload", async () => {
    const grid = await createGrid([def("a"), def("b"), def("c")], 300);
    const position = calculateFillHandlePosition({
      core: grid,
      activeCell: { row: 0, col: 0 },
      selectionRange: null,
    });
    expect(position).toMatchObject({ rowRegion: "suffix", region: "center", top: 27, left: 80 });
  });
});
