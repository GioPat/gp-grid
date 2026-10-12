// PRD 009 D3/D6: a hierarchy that loads its own rows, through GridCore.

import { afterEach, describe, expect, it, vi } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import { PaginatedRowLoader } from "../src/managers/paginated-row-loader";
import type { CellWriteRejectedEvent, DataSource, DataSourceResponse, KeyEventData } from "../src/types";
import type { AxisBounds } from "../src/types/geometry";
import {
  createHierarchyGrid,
  createHierarchySource,
  fixtureColumns,
  type FixtureRecord,
} from "./hierarchy-fixture";
import { createLazyHierarchyFixture, mountLazyGrid, mountedRows } from "./lazy-hierarchy-fixture";

// Fully expanded: 0 total, 1 g:IT, 2 g:IT:Rome, 3 r1, 4 r2, 5 g:IT:Milan,
// 6 r3, 7 g:FR, 8 g:FR:Paris, 9 r4; every leaf a placeholder at first.
const ALL = ["g:IT", "g:IT:Rome", "g:IT:Milan", "g:FR", "g:FR:Paris"];
const AMOUNT = 2;

const key = (value: string): KeyEventData => ({ key: value, shiftKey: false, ctrlKey: false, metaKey: false });

const lazy = (leavesPerCity?: number) => createLazyHierarchyFixture({ expanded: ALL, leavesPerCity });

const covers = (ranges: readonly AxisBounds[], row: number) =>
  ranges.some(({ start, end }) => row >= start && row < end);

const recordAt = (index: number): FixtureRecord => ({ id: `p${index}`, country: "IT", city: "Rome", amount: index });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("hierarchy loading — requested rows (D3)", () => {
  it("asks for the overscan window after the first load and on every scroll", async () => {
    const access = lazy(40);
    const { grid } = await mountLazyGrid(access);
    expect(access.requests).toEqual([[{ start: 0, end: 7 }]]);

    grid.setViewport(1500, 0, 400, 120);
    expect(access.requests).toHaveLength(2);
    expect(access.requests[1]).toEqual([grid.geometry.getRowWindow()]);
    expect(access.requests[1]).toEqual([{ start: 47, end: 57 }]);
  });

  it("asks for the frozen prefix first and never for the gap", async () => {
    const access = lazy(40);
    const { grid } = await mountLazyGrid(access, { freezeRows: { count: 2 } }, 300);
    expect(access.requests.at(-1)).toEqual([{ start: 0, end: 2 }, grid.geometry.getRowWindow()]);

    grid.setViewport(2400, 0, 400, 300);
    const deep = access.requests.at(-1)!;
    expect(deep).toEqual([{ start: 0, end: 2 }, grid.geometry.getRowWindow()]);
    const suffixStart = deep[1]!.start;
    expect(suffixStart).toBeGreaterThan(60);
    for (let row = 2; row < suffixStart; row++) expect(covers(deep, row)).toBe(false);
  });

  it("leaves a hierarchy without requestRows to the flat loader", async () => {
    const access = lazy();
    delete access.requestRows;
    const { grid } = await mountLazyGrid(access);
    grid.setViewport(60, 0, 400, 120);
    expect(access.requests).toEqual([]);
  });
});

describe("hierarchy loading — after a full load (D3)", () => {
  it("asks once after initialize, refresh, setDataSource and a sort change", async () => {
    let access = lazy();
    const { grid } = createHierarchyGrid(() => access);
    grid.setViewport(0, 0, 400, 120);
    await grid.initialize();
    expect(access.requests).toEqual([[{ start: 0, end: 7 }]]);

    access = lazy();
    await grid.refresh();
    expect(access.requests).toHaveLength(1);

    access = lazy();
    await grid.setDataSource(createHierarchySource(() => access));
    expect(access.requests).toHaveLength(1);

    access = lazy();
    await grid.sortFilter.setSort("amount", "asc");
    expect(access.requests).toHaveLength(1);
  });

  it("sends a flat grid's load tails to no loader", async () => {
    const flatRequest = vi.spyOn(PaginatedRowLoader.prototype, "requestVisibleRows");
    const records = Array.from({ length: 50 }, (_, index) => recordAt(index));
    const grid = new GridCore<FixtureRecord>({
      columns: fixtureColumns,
      dataSource: createClientDataSource(records),
      rowHeight: 30,
      headerHeight: 30,
    });
    grid.setViewport(0, 0, 400, 120);
    const calls = flatRequest.mock.calls.length;

    await grid.initialize();
    await grid.refresh();
    await grid.sortFilter.setSort("amount", "desc");
    expect(flatRequest.mock.calls.length).toBe(calls);
  });
});

describe("hierarchy loading — placeholder slots (D6)", () => {
  it("mounts a loading slot with no record for a placeholder in either region", async () => {
    const { batches } = await mountLazyGrid(lazy(), { freezeRows: { count: 4 } }, 300);
    const mounted = mountedRows(batches);
    for (const row of [3, 4, 6, 9]) {
      expect(mounted.get(row)).toMatchObject({ loading: true, rowData: undefined });
      expect(mounted.get(row)?.row).toBeUndefined();
    }
    expect(mounted.get(3)?.region).toBe("frozen");
    expect(mounted.get(4)?.region).toBeUndefined();
    expect(mounted.get(5)?.row).toMatchObject({ kind: "group", id: "g:IT:Milan" });
  });

  it("keeps no slot for a flat paginated grid's unavailable suffix row", async () => {
    const held: (() => void)[] = [];
    const source: DataSource<FixtureRecord> = {
      loadMode: "paginated",
      query: ({ range }) => {
        const rows = Array.from({ length: Math.min(range.endRow, 1000) - range.startRow }, (_, at) =>
          recordAt(range.startRow + at),
        );
        const response: DataSourceResponse<FixtureRecord> = { rows, totalRows: 1000 };
        if (range.startRow < 500) return Promise.resolve(response);
        return new Promise((resolve) => held.push(() => resolve(response)));
      },
    };
    const { grid, batches } = createHierarchyGrid(() => lazy(), { dataSource: source });
    grid.setViewport(0, 0, 400, 120);
    await grid.initialize();

    grid.setViewport(18000, 0, 400, 120);
    expect(held.length).toBeGreaterThan(0);
    const window = grid.geometry.getRowWindow();
    const mounted = mountedRows(batches);
    expect([...mounted.keys()].filter((row) => row >= window.start)).toEqual([]);
    expect(batches.flat().some((instruction) => "loading" in instruction)).toBe(false);
  });
});

describe("hierarchy loading — input on a placeholder (D6)", () => {
  const mountWritable = async () => {
    const rejected: CellWriteRejectedEvent[] = [];
    const access = lazy();
    const onWriteRejected = (event: CellWriteRejectedEvent) => rejected.push(event);
    const setup = await mountLazyGrid(access, { onWriteRejected }, 600);
    return { ...setup, access, rejected };
  };

  it("opens no editor from edit.start or Enter", async () => {
    const { grid, batches } = await mountWritable();
    batches.length = 0;
    expect(grid.edit.start(3, AMOUNT)).toBe(false);
    grid.input.handleKeyDown(key("Enter"), { row: 3, col: AMOUNT }, null, false);
    expect(grid.edit.getState()).toBeNull();
    expect(grid.rows.getCount()).toBe(10);
    expect(batches).toHaveLength(0);
  });

  it("rejects a paste and a fill target as not-a-record", async () => {
    const { grid, access, rejected } = await mountWritable();
    grid.selection.setActiveCell(4, AMOUNT);
    expect(grid.edit.paste("9")).toBe(true);
    expect(rejected).toMatchObject([{ row: 4, reason: "not-a-record", operation: "paste" }]);

    access.load({ start: 3, end: 4 });
    grid.fill.startFillDrag({ startRow: 3, startCol: AMOUNT, endRow: 3, endCol: AMOUNT });
    grid.fill.updateFillDrag(4, AMOUNT);
    grid.fill.commitFillDrag();
    expect(rejected.slice(1)).toMatchObject([{ row: 4, reason: "not-a-record", operation: "fill" }]);
    expect(grid.cells.getFieldValue(4, "amount")).toBeNull();
  });
});
