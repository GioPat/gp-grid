// PRD 009 through GridCore with the mock service: AC-009-01, AC-009-05, AC-009-07, refresh and writes.

import { afterEach, describe, expect, it, vi } from "vitest";
import { GridCore } from "../src/grid-core";
import { createRowGrouping } from "../src/row-grouping";
import { createServerGroupingSource, type ServerGroupingConfig } from "../src/server-grouping";
import type { ServerRowAccess } from "../src/server-grouping/server-access";
import { applyInstruction } from "../src/state-reducer";
import type {
  CellValueChangedEvent,
  CellWriteRejectedEvent,
  ColumnDefinition,
  DataSourceRange,
  GridCoreOptions,
  GridInstruction,
  RowGroupingRejection,
} from "../src/types";
import { mountedRows } from "./lazy-hierarchy-fixture";
import { createMockGroupingService, type MockRequestEntry } from "./server-grouping-mock";

interface Sale {
  id: number;
  region: string;
  city: string;
  amount: number;
}

const columns: ColumnDefinition[] = [
  { field: "region", cellDataType: "text", width: 120 },
  { field: "city", cellDataType: "text", width: 120 },
  { field: "amount", cellDataType: "number", width: 100, editable: true },
];
const AMOUNT = 2;
const ROW_HEIGHT = 30;

/** `counts[region]` records per region, spread over `cities` cities; amounts count up from 0. */
const salesOf = (counts: Record<string, number>, cities = 1): Sale[] => {
  let id = 0;
  return Object.entries(counts).flatMap(([region, count]) =>
    Array.from({ length: count }, (_, at) => ({ id: ++id, region, city: `c${at % cities}`, amount: at })),
  );
};

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** A 20-row viewport set before the first load, as a wrapper mounts it; no prefetch by default. */
const mount = async (
  rows: Sale[],
  config: Partial<ServerGroupingConfig<Sale>> = {},
  options: Partial<GridCoreOptions<Sale>> = {},
) => {
  const mock = createMockGroupingService(rows, { getRowId: (row) => row.id });
  const source = createServerGroupingSource<Sale>(mock, {
    dimensions: [{ field: "region" }],
    measures: [{ field: "amount", aggregate: "sum" }],
    getRowId: (row) => row.id,
    cache: { prefetchPages: 0 },
    ...config,
  });
  const query = vi.spyOn(source, "query");
  const grid = new GridCore<Sale>({ columns, dataSource: source, rowHeight: ROW_HEIGHT, headerHeight: 30, ...options });
  const batches: GridInstruction[][] = [];
  grid.onBatchInstruction((batch) => batches.push(batch));
  grid.setViewport(0, 0, 400, 630);
  await grid.initialize();
  await flush();
  const view = async () => (await query.mock.results.at(-1)!.value).access as ServerRowAccess<Sale>;
  return { grid, mock, source, batches, view };
};

const kinds = (requests: readonly MockRequestEntry[]) => requests.map((entry) => entry.kind);

const leafRanges = (requests: readonly MockRequestEntry[]): DataSourceRange[] =>
  requests.filter((entry) => entry.kind === "leaves").map((entry) => entry.request.range);

const toggleAndLoad = async (grid: GridCore<Sale>, viewIndex: number) => {
  expect(grid.rowGroups.toggle(grid.rows.getId(viewIndex)!)).toEqual({ status: "applied" });
  await flush();
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("server grouping through GridCore — request log (AC-009-01)", () => {
  it("loads the root from one group request and no leaves", async () => {
    const { grid, mock } = await mount(salesOf({ north: 1000, south: 5, west: 5 }));
    expect(kinds(mock.requests)).toEqual(["children"]);
    expect(mock.requests[0]!.request).toMatchObject({ revision: null, path: [], range: { startRow: 0, endRow: 100 } });
    expect(grid.rows.getCount()).toBe(3);
  });

  it("sends one leaf page for a 1,000-leaf group in view, and the next page only on a scroll", async () => {
    const { grid, mock } = await mount(salesOf({ north: 1000, south: 5, west: 5 }));
    await toggleAndLoad(grid, 0);
    expect(grid.rows.getCount()).toBe(1003);
    expect(leafRanges(mock.requests)).toEqual([{ startRow: 0, endRow: 100 }]);
    expect(grid.rows.getViewRow(1)).toMatchObject({ kind: "record", depth: 1 });

    grid.setViewport(100 * ROW_HEIGHT, 0, 400, 630);
    await flush();
    expect(leafRanges(mock.requests)).toEqual([
      { startRow: 0, endRow: 100 },
      { startRow: 100, endRow: 200 },
    ]);
  });

  it("with defaultExpandedDepth 1 loads the child groups of the visible root groups only", async () => {
    const names = Array.from({ length: 60 }, (_, at) => `r${String(at).padStart(2, "0")}`);
    const regions = Object.fromEntries(names.map((name) => [name, 3]));
    const { grid, mock } = await mount(salesOf(regions, 3), {
      dimensions: [{ field: "region" }, { field: "city" }],
      defaultExpandedDepth: 1,
    });
    expect(grid.rows.getCount()).toBe(60 * 4);
    const window = grid.geometry.getRowWindow();
    const visible = names.filter((_, at) => 4 * at < window.end);
    expect(visible.length).toBeLessThan(12);
    expect(kinds(mock.requests)).not.toContain("leaves");
    expect(mock.requests.slice(1).map((entry) => entry.request.path)).toEqual(
      visible.map((name) => [["region", "s", name]]),
    );
  });
});

describe("server grouping through GridCore — frozen prefix and failures (AC-009-05)", () => {
  it("loads the frozen prefix's page and the deep suffix's pages, none between", async () => {
    const { grid, mock } = await mount(
      salesOf({ north: 10000, south: 10 }),
      { defaultExpandedDepth: 1 },
      { freezeRows: { count: 2 } },
    );
    expect(grid.rows.getViewRow(1)).toMatchObject({ kind: "record", depth: 1 });

    grid.setViewport(5000 * ROW_HEIGHT, 0, 400, 630);
    await flush();
    const window = grid.geometry.getRowWindow();
    expect(window.start).toBeGreaterThan(4900);
    const firstPage = Math.floor((window.start - 1) / 100);
    const lastPage = Math.floor((window.end - 2) / 100);
    const suffix = Array.from({ length: lastPage - firstPage + 1 }, (_, at) => (firstPage + at) * 100);
    expect(leafRanges(mock.requests).map((range) => range.startRow)).toEqual([0, ...suffix]);
    expect(grid.rows.getViewRow(1)).toMatchObject({ kind: "record" });
    expect(grid.rows.getViewRow(window.start + 5)).toMatchObject({ kind: "record" });
  });

  it("collapses a group whose leaf page fails, keeps its sibling's rows, and loads on a second expand", async () => {
    const { grid, mock, batches } = await mount(salesOf({ north: 30, south: 5 }));
    const north = grid.rows.getId(0)!;
    await toggleAndLoad(grid, 1);
    expect(grid.rows.getViewRow(2)).toMatchObject({ kind: "record", depth: 1 });

    mock.failNext("leaves");
    await toggleAndLoad(grid, 0);
    expect(grid.rows.getViewRow(0)).toMatchObject({ id: north, expanded: false, error: "mock failure" });
    expect(mountedRows(batches).get(0)?.row).toMatchObject({ id: north, error: "mock failure" });
    expect(grid.rows.getCount()).toBe(7);
    expect(grid.rows.getViewRow(2)).toMatchObject({ kind: "record", depth: 1 });

    await toggleAndLoad(grid, 0);
    expect(grid.rows.getViewRow(0)).toMatchObject({ id: north, expanded: true });
    expect(grid.rows.getViewRow(0)).not.toHaveProperty("error");
    expect(grid.rows.getViewRow(1)).toMatchObject({ kind: "record", depth: 1 });
  });
});

describe("server grouping through GridCore — the supplied-hierarchy contract (AC-009-07)", () => {
  it("rejects a rowGrouping over the source as hierarchical-source", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rejections: RowGroupingRejection[] = [];
    const { grid } = await mount(salesOf({ north: 3, south: 2 }), {}, {
      rowGrouping: createRowGrouping({ dimensions: [{ field: "city" }] }),
      onRowGroupingRejected: (rejection) => rejections.push(rejection),
    });
    expect(rejections).toEqual([{ reason: "hierarchical-source" }]);
    expect(warn).toHaveBeenCalled();
    expect(grid.rows.getViewRow(0)).toMatchObject({ kind: "group", field: "region", value: "north" });
  });

  it("shows a placeholder as a loading row with no view row, in a hierarchical grid", async () => {
    const { grid, mock, batches } = await mount(salesOf({ north: 1000 }));
    const north = grid.rows.getId(0)!;
    mock.hold();
    await toggleAndLoad(grid, 0);
    expect(grid.rows.getViewRow(1)).toBeUndefined();
    expect(grid.rows.has(1)).toBe(false);
    expect(grid.rows.getId(1)).toBe(`gp-pending:0@${String(north)}`);
    expect(mountedRows(batches).get(1)).toMatchObject({ loading: true, rowData: undefined });

    const loaded = batches.flat().filter((instruction) => instruction.type === "DATA_LOADED");
    expect(loaded.at(-1)).toEqual({ type: "DATA_LOADED", totalRows: 1001, hierarchical: true });
    expect(applyInstruction(loaded.at(-1)!, new Map(), new Map())).toMatchObject({ hierarchical: true });

    mock.release();
    await flush();
    expect(grid.rows.getViewRow(1)).toMatchObject({ kind: "record", depth: 1 });
    expect(mountedRows(batches).get(1)?.loading).toBeUndefined();
  });
});

describe("server grouping through GridCore — refresh and sort", () => {
  it("refresh() keeps a root-page group's expansion and the active cell on its loaded leaf", async () => {
    const { grid, mock } = await mount(salesOf({ north: 3, south: 2 }));
    const north = grid.rows.getId(0)!;
    await toggleAndLoad(grid, 0);
    const leaf = grid.rows.getId(2);
    grid.selection.setActiveCell(2, AMOUNT);
    const sent = mock.requests.length;

    await grid.refresh();
    await flush();
    expect(kinds(mock.requests.slice(sent))).toEqual(["children", "leaves"]);
    expect(grid.rows.getViewRow(0)).toMatchObject({ id: north, expanded: true });
    expect(grid.selection.getActiveCell()).toEqual({ row: 2, col: AMOUNT });
    expect(grid.rows.getViewRow(2)).toMatchObject({ kind: "record", id: leaf });
  });

  it("queries again on a sort change and sends the sort with every request", async () => {
    const { grid, mock } = await mount(salesOf({ north: 3, south: 2 }));
    const sent = mock.requests.length;
    await grid.sortFilter.setSort("amount", "desc");
    await flush();
    await toggleAndLoad(grid, 0);

    const later = mock.requests.slice(sent);
    expect(kinds(later)).toEqual(["children", "leaves"]);
    for (const entry of later) expect(entry.request.sort).toEqual([{ colId: "amount", direction: "desc" }]);
    expect([1, 2, 3].map((row) => grid.cells.getFieldValue(row, "amount"))).toEqual([2, 1, 0]);
  });
});

describe("server grouping through GridCore — internal diagnostics", () => {
  it("counts the view's loaded and in-flight pages", async () => {
    const { grid, mock, view } = await mount(salesOf({ north: 1000, south: 5 }));
    const access = await view();
    expect(access.diagnostics()).toEqual({ loadedPages: 1, inFlight: 0 });
    mock.hold();
    await toggleAndLoad(grid, 0);
    expect(access.diagnostics()).toEqual({ loadedPages: 1, inFlight: 1 });
    mock.release();
    await flush();
    expect(access.diagnostics()).toEqual({ loadedPages: 2, inFlight: 0 });
    await toggleAndLoad(grid, 0);
    expect(access.diagnostics()).toEqual({ loadedPages: 1, inFlight: 0 });
  });
});

describe("server grouping through GridCore — writes", () => {
  it("is read-only by default", async () => {
    const rejected: CellWriteRejectedEvent[] = [];
    const { grid } = await mount(salesOf({ north: 3 }), {}, { onWriteRejected: (event) => rejected.push(event) });
    await toggleAndLoad(grid, 0);
    expect(grid.rows.isWritable()).toBe(false);
    expect(grid.edit.start(1, AMOUNT)).toBe(false);
    expect(rejected).toMatchObject([{ row: 1, reason: "read-only-source", operation: "edit" }]);
  });

  it("with writable: true edits the cached leaf and reports its id", async () => {
    const changes: CellValueChangedEvent<Sale>[] = [];
    const { grid } = await mount(salesOf({ north: 3 }), { writable: true }, {
      getRowId: (row) => row.id,
      onCellValueChanged: (event) => changes.push(event),
    });
    await toggleAndLoad(grid, 0);
    const record = grid.rows.getData(1)!;
    expect(grid.edit.start(1, AMOUNT)).toBe(true);
    grid.edit.updateValue(99);
    grid.edit.commit();
    expect(record.amount).toBe(99);
    expect(grid.cells.getFieldValue(1, "amount")).toBe(99);
    expect(changes).toMatchObject([{ rowId: record.id, field: "amount", oldValue: 0, newValue: 99 }]);
  });
});
