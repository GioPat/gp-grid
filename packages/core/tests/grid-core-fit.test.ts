// packages/core/tests/grid-core-fit.test.ts
// PRD 007 D3: `rowHeights.fit` and `columns.fit` through GridCore over a fake
// measurement host, 1,000 client rows at 32 px and a 400 × 320 body.

import { describe, expect, it } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource, createServerDataSource } from "../src/data-source";
import type {
  AutoFitOptions,
  ColumnDefinition,
  ColumnResizedEvent,
  DataSourceRequest,
  FreezeRowsOptions,
  GridInstruction,
  RowResizedEvent,
} from "../src/types";
import type {
  ColumnMeasurement,
  MeasurementHost,
  RowMeasurement,
} from "../src/types/measurement";

interface Row {
  id: number;
  name: string;
}

const ROW_HEIGHT = 32;
const WIDTH = 400;
const HEIGHT = 320;

// `fixed` with no column overscan: id, name and notes fill the 400 px body and
// mount; c0–c2 start at 400 and do not.
const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 80 },
  { field: "name", cellDataType: "text", width: 120, maxWidth: 300 },
  { field: "notes", cellDataType: "text", width: 200 },
  { field: "secret", cellDataType: "text", width: 100, hidden: true },
  { field: "c0", cellDataType: "text", width: 200 },
  { field: "c1", cellDataType: "text", width: 200 },
  { field: "c2", cellDataType: "text", width: 200 },
];

const pick = (sizes: ReadonlyMap<number, number>, indexes: readonly number[]): Map<number, number> =>
  new Map(indexes.flatMap((index) => {
    const size = sizes.get(index);
    return size === undefined ? [] : [[index, size] as const];
  }));

class FakeHost implements MeasurementHost {
  readonly heights = new Map<number, number>();
  readonly widths = new Map<number, number>();
  readonly rowCalls: number[][] = [];
  readonly columnCalls: number[][] = [];
  answersNull = false;
  revision: () => number = () => -1;

  measureRows(rowIndexes: readonly number[]): RowMeasurement | null {
    this.rowCalls.push([...rowIndexes]);
    if (this.answersNull) return null;
    return { layoutRevision: this.revision(), heights: pick(this.heights, rowIndexes), consideredColumns: 3 };
  }

  measureColumns(layoutIndexes: readonly number[]): ColumnMeasurement | null {
    this.columnCalls.push([...layoutIndexes]);
    if (this.answersNull) return null;
    return { layoutRevision: this.revision(), widths: pick(this.widths, layoutIndexes), consideredRows: 12 };
  }
}

interface HarnessOptions {
  host?: FakeHost | null;
  freezeRows?: FreezeRowsOptions;
  autoFit?: AutoFitOptions;
}

const createGrid = async (options: HarnessOptions = {}) => {
  const host = options.host === null ? undefined : options.host ?? new FakeHost();
  const rowEvents: RowResizedEvent[] = [];
  const columnEvents: ColumnResizedEvent[] = [];
  const grid = new GridCore<Row>({
    columns,
    dataSource: createClientDataSource(
      Array.from({ length: 1_000 }, (_, id) => ({ id, name: `Name ${id}` })),
    ),
    rowHeight: ROW_HEIGHT,
    headerHeight: 36,
    overscan: 2,
    columnLayout: "fixed",
    columnOverscan: 0,
    getRowId: (row) => row.id,
    freezeRows: options.freezeRows,
    autoFit: options.autoFit,
    measurementHost: host,
    onRowResized: (event) => rowEvents.push(event),
    onColumnResized: (event) => columnEvents.push(event),
  });
  if (host !== undefined) host.revision = () => grid.geometry.getColumnWindow().layout.revision;
  await grid.initialize();
  grid.setViewport(0, 0, WIDTH, HEIGHT);
  return { grid, host: host ?? new FakeHost(), rowEvents, columnEvents };
};

const record = (grid: GridCore<Row>): GridInstruction[][] => {
  const batches: GridInstruction[][] = [];
  grid.onBatchInstruction((batch) => batches.push([...batch]));
  return batches;
};

const heightAt = (grid: GridCore<Row>, viewIndex: number): number => {
  const bounds = grid.geometry.getRowBounds(viewIndex, "content");
  return bounds === undefined ? 0 : bounds.end - bounds.start;
};

const widthOf = (grid: GridCore<Row>, columnId: string): number | undefined =>
  grid.columns.getState().find((state) => state.columnId === columnId)?.resolvedWidth;

const scrollTosOf = (batches: GridInstruction[][]): number[] =>
  batches.flat().flatMap((instruction) =>
    instruction.type === "SCROLL_TO" && instruction.scrollTop !== undefined ? [instruction.scrollTop] : [],
  );

describe("GridCore fit — status", () => {
  it("is unsupported without a host and after destroy", async () => {
    const { grid } = await createGrid({ host: null });
    expect(grid.rowHeights.fit()).toEqual({
      status: "unsupported", consideredColumns: 0, rows: [], skipped: [],
    });
    expect(grid.columns.fit()).toEqual({
      status: "unsupported", scope: "rendered", consideredRows: 0, columns: [], skipped: [],
    });

    const hosted = await createGrid();
    hosted.grid.destroy();
    expect(hosted.grid.rowHeights.fit().status).toBe("unsupported");
    expect(hosted.grid.columns.fit().status).toBe("unsupported");
    expect(hosted.host.rowCalls).toEqual([]);
    expect(hosted.host.columnCalls).toEqual([]);
  });

  it("is unsupported when the host has nothing to measure against", async () => {
    const { grid, host } = await createGrid();
    host.answersNull = true;
    const batches = record(grid);

    expect(grid.rowHeights.fit([2, 700]).status).toBe("unsupported");
    expect(grid.rowHeights.fit([2, 700]).skipped).toEqual([{ rowId: 700, reason: "not-mounted" }]);
    expect(grid.columns.fit().status).toBe("unsupported");
    expect(batches).toEqual([]);
  });

  it("applies nothing for a measurement under a previous layout revision (AC-007-02)", async () => {
    const { grid, host, rowEvents, columnEvents } = await createGrid();
    const previous = grid.geometry.getColumnWindow().layout.revision;
    grid.columns.setWidth(2, 240);
    host.revision = () => previous;
    host.heights.set(2, 90);
    host.widths.set(1, 180);
    columnEvents.length = 0;
    const batches = record(grid);

    expect(grid.rowHeights.fit([2])).toEqual({
      status: "stale", consideredColumns: 3, rows: [], skipped: [],
    });
    expect(grid.columns.fit(["name"])).toEqual({
      status: "stale", scope: "rendered", consideredRows: 12, columns: [], skipped: [],
    });
    expect(batches).toEqual([]);
    expect(grid.rowHeights.getOverrides()).toEqual([]);
    expect(heightAt(grid, 2)).toBe(ROW_HEIGHT);
    expect(widthOf(grid, "name")).toBe(120);
    expect(rowEvents).toEqual([]);
    expect(columnEvents).toEqual([]);
  });

  it("stores a row fit as a height and reports a repeat as unchanged", async () => {
    const { grid, host } = await createGrid();
    host.heights.set(2, 70);
    const batches = record(grid);

    expect(grid.rowHeights.fit([2])).toEqual({
      status: "applied", consideredColumns: 3, rows: [{ rowId: 2, height: 70, clamped: null }], skipped: [],
    });
    expect(batches).toHaveLength(1);
    expect(heightAt(grid, 2)).toBe(70);
    expect(grid.rowHeights.getOverrides()).toEqual([{ rowId: 2, height: 70 }]);

    expect(grid.rowHeights.fit([2]).status).toBe("unchanged");
    expect(batches).toHaveLength(1);
  });

  it("applies a column fit as pixel overrides in one batch", async () => {
    const { grid, host } = await createGrid();
    host.widths.set(1, 150.2);
    host.widths.set(2, 260);
    const batches = record(grid);

    const result = grid.columns.fit(["name", "notes"]);

    expect(result).toEqual({
      status: "applied",
      scope: "rendered",
      consideredRows: 12,
      columns: [
        { columnId: "name", width: 151, clamped: null },
        { columnId: "notes", width: 260, clamped: null },
      ],
      skipped: [],
    });
    expect(batches).toHaveLength(1);
    const state = grid.columns.getState();
    expect(state.find((entry) => entry.columnId === "name")?.width).toBe(151);
    expect(state.find((entry) => entry.columnId === "notes")?.width).toBe(260);
    expect(grid.columns.fit(["name", "notes"]).status).toBe("unchanged");
    expect(batches).toHaveLength(1);
  });
});

describe("GridCore fit — clamping", () => {
  it("clamps rows into [minRowHeight, maxRowHeight]", async () => {
    const { grid, host } = await createGrid();
    host.heights.set(1, 10);
    host.heights.set(2, 1_000);

    expect(grid.rowHeights.fit([1, 2]).rows).toEqual([
      { rowId: 1, height: ROW_HEIGHT, clamped: "min" },
      { rowId: 2, height: 10 * ROW_HEIGHT, clamped: "max" },
    ]);

    const custom = await createGrid({ autoFit: { minRowHeight: 20, maxRowHeight: 100 } });
    custom.host.heights.set(1, 10);
    custom.host.heights.set(2, 1_000);
    expect(custom.grid.rowHeights.fit([1, 2]).rows.map((row) => row.height)).toEqual([20, 100]);
  });

  it("rounds column widths up and clamps them to the column and autoFit bounds", async () => {
    const { grid, host } = await createGrid({ autoFit: { maxColumnWidth: 250 } });
    host.widths.set(0, 12);
    host.widths.set(1, 450.2);
    host.widths.set(2, 700);

    expect(grid.columns.fit().columns).toEqual([
      { columnId: "id", width: 50, clamped: "min" },
      { columnId: "name", width: 250, clamped: "max" },
      { columnId: "notes", width: 250, clamped: "max" },
    ]);
  });
});

describe("GridCore fit — targets", () => {
  it("fits every mounted row and every mounted displayed column when ids are omitted", async () => {
    const { grid, host } = await createGrid({ freezeRows: { count: 2 } });
    grid.setViewport(3_200, 0, WIDTH, HEIGHT);
    const window = grid.geometry.getRowWindow();

    grid.rowHeights.fit();
    grid.columns.fit();

    const windowRows = Array.from({ length: window.end - window.start }, (_, i) => window.start + i);
    expect(host.rowCalls).toEqual([[0, 1, ...windowRows]]);
    expect(host.columnCalls).toEqual([[0, 1, 2]]);
  });

  it("skips unmounted rows and unknown, hidden and unmounted columns", async () => {
    const { grid, host } = await createGrid();
    host.heights.set(2, 40);

    expect(grid.rowHeights.fit([2, 3, 500, "nope"])).toEqual({
      status: "applied",
      consideredColumns: 3,
      rows: [{ rowId: 2, height: 40, clamped: null }],
      skipped: [
        { rowId: 500, reason: "not-mounted" },
        { rowId: "nope", reason: "not-mounted" },
        { rowId: 3, reason: "not-mounted" },
      ],
    });
    expect(host.rowCalls).toEqual([[2, 3]]);

    expect(grid.columns.fit(["missing", "secret", "c1", "name"]).skipped).toEqual([
      { columnId: "missing", reason: "unknown" },
      { columnId: "secret", reason: "hidden" },
      { columnId: "c1", reason: "not-mounted" },
      { columnId: "name", reason: "not-mounted" },
    ]);
    expect(host.columnCalls).toEqual([[1]]);
  });
});

describe("GridCore fit — identity and anchoring", () => {
  it("lists a fitted row, keeps it through a sort and drops it on reset", async () => {
    const { grid, host } = await createGrid();
    host.heights.set(5, 96);
    grid.rowHeights.fit([5]);
    expect(grid.rowHeights.getOverrides()).toEqual([{ rowId: 5, height: 96 }]);

    await grid.sortFilter.setSort("id", "desc");
    expect(heightAt(grid, 1_000 - 1 - 5)).toBe(96);
    expect(heightAt(grid, 5)).toBe(ROW_HEIGHT);

    grid.rowHeights.reset([5]);
    expect(heightAt(grid, 1_000 - 1 - 5)).toBe(ROW_HEIGHT);
    expect(grid.rowHeights.getOverrides()).toEqual([]);
  });

  it("keeps the first visible row in place when a row above it grows", async () => {
    const { grid, host } = await createGrid();
    grid.setViewport(3_200, 0, WIDTH, HEIGHT);
    const firstVisible = grid.geometry.getVisibleRowWindow().start;
    const topBefore = grid.geometry.getRowBounds(firstVisible, "viewport")?.start;
    host.heights.set(firstVisible - 1, 96);
    const batches = record(grid);

    expect(grid.rowHeights.fit([firstVisible - 1]).status).toBe("applied");

    expect(scrollTosOf(batches)).toEqual([3_264]);
    expect(grid.geometry.getRowBounds(firstVisible, "viewport")?.start).toBe(topBefore);
  });

  it("grows the frozen band without a scroll and lowers the count when it no longer fits (AC-007-05)", async () => {
    const { grid, host } = await createGrid({
      freezeRows: { count: 3 },
      autoFit: { maxRowHeight: 500 },
    });
    const belowBand = (): number =>
      (grid.geometry.getRowBounds(3, "viewport")?.start ?? 0) - grid.geometry.getRowRegions().frozenExtent;
    const before = belowBand();
    host.heights.set(1, 96);
    const batches = record(grid);

    grid.rowHeights.fit([1]);

    expect(grid.geometry.getRowRegions().frozenExtent).toBe(160);
    expect(scrollTosOf(batches)).toEqual([]);
    expect(belowBand()).toBe(before);

    host.heights.set(1, 400);
    grid.rowHeights.fit([1]);
    expect(grid.geometry.getRowRegions().frozen).toEqual({
      requestedCount: 3,
      effectiveCount: 1,
      limit: "viewport",
    });
  });
});

describe("GridCore fit — paging and events", () => {
  it("issues no data request on a paginated source (AC-007-04)", async () => {
    const requests: DataSourceRequest[] = [];
    const host = new FakeHost();
    const grid = new GridCore<Row>({
      columns,
      dataSource: createServerDataSource<Row>(async (request) => {
        requests.push(request);
        const { startRow, endRow } = request.range;
        const rows = Array.from({ length: endRow - startRow }, (_, i) => ({
          id: startRow + i,
          name: `Name ${startRow + i}`,
        }));
        return { rows, totalRows: 10_000 };
      }),
      rowHeight: ROW_HEIGHT,
      getRowId: (row) => row.id,
      rowLoading: { cache: { pageSize: 100, prefetchPages: 0 } },
      measurementHost: host,
    });
    host.revision = () => grid.geometry.getColumnWindow().layout.revision;
    await grid.initialize();
    grid.setViewport(0, 0, WIDTH, HEIGHT);
    for (let index = 0; index < 20; index += 1) host.heights.set(index, 64);
    const recorded = requests.length;

    expect(grid.rowHeights.fit().status).toBe("applied");
    expect(grid.columns.fit().scope).toBe("rendered");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(requests).toHaveLength(recorded);
    expect(heightAt(grid, 0)).toBe(64);
  });

  it("fires one event per changed row and column", async () => {
    const { grid, host, rowEvents, columnEvents } = await createGrid();
    host.heights.set(0, ROW_HEIGHT);
    host.heights.set(1, 48);
    host.widths.set(0, 80);
    host.widths.set(1, 151);
    host.widths.set(2, 260);

    grid.rowHeights.fit();
    grid.columns.fit();

    expect(rowEvents).toEqual([{ rowId: 1, height: 48, viewIndex: 1 }]);
    expect(columnEvents).toEqual([
      { columnId: "name", width: 151, viewIndex: 1 },
      { columnId: "notes", width: 260, viewIndex: 2 },
    ]);
  });
});
