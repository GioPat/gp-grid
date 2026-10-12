// PRD 009 D6 through GridCore: refresh() puts the active cell and the scroll anchor back by id,
// on their old index while that row is a placeholder, and clears a row that is gone.

import { describe, expect, it } from "vitest";
import { GridCore } from "../src/grid-core";
import { createServerGroupingSource } from "../src/server-grouping";
import type { ColumnDefinition, GridInstruction } from "../src/types";
import { createMockGroupingService } from "./server-grouping-mock";

interface Sale {
  id: number;
  region: string;
  amount: number;
}

const columns: ColumnDefinition[] = [
  { field: "region", cellDataType: "text", width: 120 },
  { field: "amount", cellDataType: "number", width: 100 },
];
const AMOUNT = 1;
const ROW_HEIGHT = 30;

/** `counts[region]` records per region, with ids from 1. */
const salesOf = (counts: Record<string, number>): Sale[] => {
  let id = 0;
  return Object.entries(counts).flatMap(([region, count]) =>
    Array.from({ length: count }, (_, at) => ({ id: ++id, region, amount: at })),
  );
};

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** A 20-row viewport set before the first load. The mock reads `rows` live, so a test edits the server's data. */
const mount = async (rows: Sale[]) => {
  const service = createMockGroupingService(rows, { getRowId: (row) => row.id });
  const dataSource = createServerGroupingSource<Sale>(service, {
    dimensions: [{ field: "region" }],
    measures: [{ field: "amount", aggregate: "sum" }],
    getRowId: (row) => row.id,
    cache: { prefetchPages: 0 },
  });
  const grid = new GridCore<Sale>({ columns, dataSource, rowHeight: ROW_HEIGHT, headerHeight: 30 });
  const batches: GridInstruction[][] = [];
  grid.onBatchInstruction((batch) => batches.push(batch));
  grid.setViewport(0, 0, 400, 630);
  await grid.initialize();
  await flush();
  return { grid, batches };
};

const expandAndLoad = async (grid: GridCore<Sale>, viewIndex: number) => {
  expect(grid.rowGroups.toggle(grid.rows.getId(viewIndex)!)).toEqual({ status: "applied" });
  await flush();
};

const scrollTops = (batches: readonly GridInstruction[][]): (number | undefined)[] =>
  batches.flat().flatMap((entry) => (entry.type === "SCROLL_TO" ? [entry.scrollTop] : []));

describe("server grouping through GridCore — refresh keeps the active cell and the anchor", () => {
  it("puts both back on their root-page rows by id", async () => {
    const names = Array.from({ length: 60 }, (_, at) => `r${String(at).padStart(2, "0")}`);
    const rows = salesOf(Object.fromEntries(names.map((name) => [name, 1])));
    const { grid, batches } = await mount(rows);
    const scrollTop = 30 * ROW_HEIGHT + 10;
    grid.setViewport(scrollTop, 0, 400, 630);
    grid.selection.setActiveCell(31, AMOUNT);
    const active = grid.rows.getId(31);

    rows.unshift({ id: 1000, region: "a", amount: 0 });
    batches.length = 0;
    await grid.refresh();
    expect(grid.rows.getId(32)).toBe(active);
    expect(grid.selection.getActiveCell()).toEqual({ row: 32, col: AMOUNT });
    expect(scrollTops(batches).at(-1)).toBe(scrollTop + ROW_HEIGHT);
  });

  it("clears the selection when the active leaf is gone and its old index holds a loaded row", async () => {
    const rows = salesOf({ b: 1, north: 3, x1: 1, x2: 1, x3: 1, x4: 1 });
    const { grid } = await mount(rows);
    await expandAndLoad(grid, 1);
    expect(grid.rows.getViewRow(3)).toMatchObject({ kind: "record", depth: 1 });
    grid.selection.setActiveCell(3, AMOUNT);

    rows.splice(0, rows.length, ...rows.filter((row) => row.region !== "north"));
    await grid.refresh();
    expect(grid.rows.getViewRow(3)).toMatchObject({ kind: "group", value: "x3" });
    expect(grid.selection.getActiveCell()).toBeNull();
  });

  it("keeps the anchor on its old index while its leaf is a placeholder", async () => {
    const { grid, batches } = await mount(salesOf({ north: 1000 }));
    await expandAndLoad(grid, 0);
    // A taller leaf above the anchor: after the reload it is a placeholder of the default height.
    grid.rowHeights.set([{ rowId: grid.rows.getId(10)!, height: 3 * ROW_HEIGHT }]);
    const scrollTop = 500 * ROW_HEIGHT + 2 * ROW_HEIGHT + 10;
    grid.setViewport(scrollTop, 0, 400, 630);
    await flush();
    const anchor = grid.rows.getId(500);
    expect(grid.rows.getViewRow(500)).toMatchObject({ kind: "record" });

    batches.length = 0;
    await grid.refresh();
    expect(scrollTops(batches).at(-1)).toBe(scrollTop - 2 * ROW_HEIGHT);
    await flush();
    expect(grid.rows.getId(500)).toBe(anchor);
  });
});
