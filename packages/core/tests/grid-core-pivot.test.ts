// PRD 012 D1, D4: createPivotSource through GridCore — schema, values, expansion, sort, filter, refresh, writes.

import { afterEach, describe, expect, it, vi } from "vitest";
import { createMutableClientDataSource } from "../src/data-source";
import { GridCore } from "../src/grid-core";
import { encodeGroupId } from "../src/hierarchy/group-path";
import { encodePivotColumnId } from "../src/hierarchy/pivot-ids";
import { createPivotSource } from "../src/pivot";
import type { CellValue, CellWriteRejectedEvent, GridInstruction, PivotConfig, PivotSchema } from "../src/types";
import { SALES, type Sale } from "./pivot-sales";

type SaleRecord = Sale & { id: number };

const CONFIG: PivotConfig = {
  rows: [{ field: "region" }, { field: "city" }],
  pivots: [{ field: "year" }, { field: "quarter" }],
  measures: [
    { field: "amount", aggregate: "sum" },
    { field: "n", source: "amount", aggregate: "count" },
  ],
  rowTotals: true,
  grandTotal: "top",
};

const NORTH = encodeGroupId([["region", "s", "North"]]);
const OSLO = encodeGroupId([["region", "s", "North"], ["city", "s", "Oslo"]]);
const TOTAL_AMOUNT = encodePivotColumnId([], "amount");
const Q1_2024_AMOUNT = encodePivotColumnId([["year", "n", 2024], ["quarter", "s", "Q1"]], "amount");
const Q1_2025_AMOUNT = encodePivotColumnId([["year", "n", 2025], ["quarter", "s", "Q1"]], "amount");
const Q1_2026_AMOUNT = encodePivotColumnId([["year", "n", 2026], ["quarter", "s", "Q1"]], "amount");
const Q1_2026_COUNT = encodePivotColumnId([["year", "n", 2026], ["quarter", "s", "Q1"]], "n");

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const applySchema = (grid: GridCore<SaleRecord>, schema: PivotSchema) => grid.columns.set(schema.columns, schema.columnGroups);

/** `onNotify` applies each schema from the listener; otherwise the test applies it after the load. */
const mount = async ({ onNotify = true, onWriteRejected }: {
  onNotify?: boolean;
  onWriteRejected?: (event: CellWriteRejectedEvent) => void;
} = {}) => {
  const inner = createMutableClientDataSource<SaleRecord>(
    SALES.map((sale, id) => ({ ...sale, id })),
    { getRowId: (row) => row.id, debounceMs: 0, useWorker: false },
  );
  const innerQuery = vi.spyOn(inner, "query");
  const source = createPivotSource(inner, CONFIG);
  const grid = new GridCore<SaleRecord>({
    columns: [],
    dataSource: source,
    rowHeight: 30,
    headerHeight: 30,
    onWriteRejected,
  });
  const notified: PivotSchema[] = [];
  const stop = source.subscribeSchema((schema) => {
    notified.push(schema);
    if (onNotify) applySchema(grid, schema);
  });
  const batches: GridInstruction[][] = [];
  grid.onBatchInstruction((batch) => batches.push(batch));
  grid.setViewport(0, 0, 800, 600);
  await grid.initialize();
  await flush();
  if (onNotify === false) applySchema(grid, source.getSchema()!);
  return { grid, inner, innerQuery, source, notified, stop, batches };
};

const columnIndex = (grid: GridCore<SaleRecord>, id: string) => grid.columns.get().findIndex((column) => column.colId === id);

/** Each view row as its id, then every column's value by layout index. */
const cells = (grid: GridCore<SaleRecord>): CellValue[][] =>
  Array.from({ length: grid.rows.getCount() }, (_, row) => [
    grid.rows.getId(row) ?? null,
    ...grid.columns.get().map((_, col) => grid.cells.getValue(row, col)),
  ]);

const labels = (grid: GridCore<SaleRecord>): CellValue[] =>
  Array.from({ length: grid.rows.getCount() }, (_, row) => {
    const view = grid.rows.getViewRow(row);
    return view?.kind === "group" ? view.value : (view?.kind ?? null);
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pivot through GridCore — schema and values", () => {
  it("settles to the same cells with the schema applied from the listener or after the query", async () => {
    const early = await mount();
    const late = await mount({ onNotify: false });
    expect(early.grid.columns.get().map((column) => column.colId)).toEqual(
      early.source.getSchema()!.columns.map((column) => column.colId),
    );
    expect(early.grid.columns.getGroups()).toHaveLength(4);
    expect(cells(early.grid)).toEqual(cells(late.grid));
    expect(labels(early.grid)).toEqual(["total", "North", "South"]);
    expect(early.notified).toHaveLength(1);
  });

  it("reads generated cells by column id, row totals and the grand total", async () => {
    const { grid } = await mount();
    expect(grid.cells.getValue(0, columnIndex(grid, Q1_2024_AMOUNT))).toBe(15);
    expect(grid.cells.getValue(1, columnIndex(grid, TOTAL_AMOUNT))).toBe(42);
    expect(grid.cells.getFieldValue(2, TOTAL_AMOUNT)).toBe(13);
    expect(grid.cells.getFieldValue(2, Q1_2024_AMOUNT)).toBeNull();
    expect(grid.cells.getValue(1, 0)).toBeNull();
  });

  it("reports group and total view rows, terminal rows with childCount 0", async () => {
    const { grid } = await mount();
    grid.rowGroups.setExpanded([NORTH], true);
    expect(grid.rows.getViewRow(0)).toMatchObject({ kind: "total", leafCount: 7 });
    expect(grid.rows.getViewRow(1)).toMatchObject({ kind: "group", id: NORTH, childCount: 2, expanded: true });
    expect(grid.rows.getViewRow(3)).toMatchObject({ kind: "group", id: OSLO, childCount: 0, leafCount: 2 });
    expect(grid.rows.getViewRow(4)).toMatchObject({ kind: "group", value: "South", childCount: 1 });
  });
});

describe("pivot through GridCore — expansion", () => {
  it("expands a region without a query and leaves a city unchanged", async () => {
    const { grid, innerQuery } = await mount();
    const queries = innerQuery.mock.calls.length;
    expect(grid.rowGroups.setExpanded([NORTH], true)).toEqual({ status: "applied" });
    expect(labels(grid)).toEqual(["total", "North", "Bergen", "Oslo", "South"]);
    expect(grid.rowGroups.toggle(OSLO)).toEqual({ status: "unchanged" });
    expect(grid.rowGroups.toggle(NORTH)).toEqual({ status: "applied" });
    expect(labels(grid)).toEqual(["total", "North", "South"]);
    expect(innerQuery.mock.calls.length).toBe(queries);
  });
});

describe("pivot through GridCore — sort and filter", () => {
  it("re-queries on a sort of a generated column and reorders the regions", async () => {
    const { grid, innerQuery } = await mount();
    const queries = innerQuery.mock.calls.length;
    await grid.sortFilter.setSort(Q1_2025_AMOUNT, "desc");
    await flush();
    expect(innerQuery.mock.calls.length).toBe(queries + 1);
    expect(innerQuery.mock.calls.at(-1)![0].sort).toBeUndefined();
    expect(labels(grid)).toEqual(["total", "South", "North"]);
    expect(grid.cells.getFieldValue(1, Q1_2025_AMOUNT)).toBe(10);
  });

  it("passes the filter to the inner source", async () => {
    const { grid, innerQuery } = await mount();
    // North keeps every tuple, so the schema and the layout stay as they are.
    await grid.sortFilter.setFilter("region", "North");
    await flush();
    expect(innerQuery.mock.calls.at(-1)![0].filter).toHaveProperty("region");
    expect(labels(grid)).toEqual(["total", "North"]);
    expect(grid.cells.getFieldValue(0, TOTAL_AMOUNT)).toBe(42);
  });
});

describe("pivot through GridCore — transaction refresh", () => {
  it("rebuilds on a new pivot key, notifies the changed schema once and shows its column", async () => {
    const { grid, inner, innerQuery, notified } = await mount();
    const queries = innerQuery.mock.calls.length;
    inner.addRows([{ region: "North", city: "Oslo", year: 2026, quarter: "Q1", amount: 5, id: 99 }]);
    await inner.flushTransactions();
    await grid.refreshFromTransaction();
    await flush();
    expect(innerQuery.mock.calls.length).toBe(queries + 1);
    expect(notified).toHaveLength(2);
    expect(notified[1]!.columns).toHaveLength(11);
    expect(grid.columns.get().map((column) => column.colId)).toEqual(notified[1]!.columns.map((column) => column.colId));
    expect(grid.cells.getValue(1, columnIndex(grid, Q1_2026_AMOUNT))).toBe(5);
    expect(grid.cells.getValue(1, columnIndex(grid, Q1_2026_COUNT))).toBe(1);
    expect(grid.cells.getFieldValue(1, TOTAL_AMOUNT)).toBe(47);

    await grid.refreshFromTransaction();
    expect(notified).toHaveLength(2);
  });
});

describe("pivot through GridCore — writes", () => {
  it("rejects every write path on a read-only source", async () => {
    const rejected: CellWriteRejectedEvent[] = [];
    const { grid } = await mount({ onWriteRejected: (event) => rejected.push(event) });
    const amount = columnIndex(grid, Q1_2024_AMOUNT);
    expect(grid.rows.isWritable()).toBe(false);
    expect(grid.edit.start(1, amount)).toBe(false);
    expect(grid.edit.getState()).toBeNull();

    grid.selection.setActiveCell(1, amount);
    grid.edit.paste("9\n9");
    grid.fill.startFillDrag({ startRow: 1, startCol: amount, endRow: 1, endCol: amount });
    grid.fill.updateFillDrag(2, amount);
    grid.fill.commitFillDrag();
    grid.cells.setValue(1, amount, 5);

    const operations = new Set(rejected.map((event) => event.operation));
    expect(operations).toEqual(new Set(["paste", "fill", "setCellValue"]));
    expect(grid.cells.getFieldValue(1, Q1_2024_AMOUNT)).toBe(15);
    expect(grid.cells.getFieldValue(2, Q1_2024_AMOUNT)).toBeNull();
  });
});

describe("pivot through GridCore — destroy", () => {
  it("core.destroy() then source.destroy() leaves no listener", async () => {
    const { grid, source, notified, batches } = await mount();
    grid.destroy();
    source.destroy();
    const sent = batches.length;
    await expect(source.query({ range: { startRow: 0, endRow: 10 } })).rejects.toThrow("pivot source destroyed");
    expect(notified).toHaveLength(1);
    expect(batches.length).toBe(sent);
  });
});
