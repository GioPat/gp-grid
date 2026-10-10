// PRD 008 Slice 2: the local grouping engine bound through GridCore (D2, D3, D7).

import { afterEach, describe, expect, it, vi } from "vitest";
import { GridCore } from "../src/grid-core";
import {
  createClientDataSource,
  createColumnarDataSource,
  createMutableClientDataSource,
} from "../src/data-source";
import { createRowGrouping } from "../src/row-grouping";
import type {
  ColumnDefinition,
  DataSource,
  GridCoreOptions,
  RowGroupingConfig,
  RowGroupingRejection,
} from "../src/types";
import { createHierarchyFixture, createHierarchySource } from "./hierarchy-fixture";

interface Sale {
  id: number;
  country: string;
  city: string;
  amount: number;
}

const SALES: readonly Sale[] = [
  { id: 1, country: "IT", city: "Rome", amount: 10 },
  { id: 2, country: "IT", city: "Rome", amount: 30 },
  { id: 3, country: "IT", city: "Milan", amount: 20 },
  { id: 4, country: "FR", city: "Paris", amount: 5 },
  { id: 5, country: "FR", city: "Lyon", amount: 40 },
  { id: 6, country: "DE", city: "Berlin", amount: 7 },
];

const columns: ColumnDefinition[] = [
  { field: "country", cellDataType: "text", width: 100, editable: true },
  { field: "city", cellDataType: "text", width: 100 },
  { field: "amount", cellDataType: "number", width: 100, editable: true },
];
const COUNTRY = 0;
const AMOUNT = 2;

const config: RowGroupingConfig = {
  dimensions: [{ field: "country" }, { field: "city" }],
  measures: [
    { field: "amount", aggregate: "max" },
    { field: "sum", source: "amount", aggregate: "sum" },
  ],
  grandTotal: "top",
};

const copySales = () => SALES.map((sale) => ({ ...sale }));

const counted = <T>(source: DataSource<T>) => {
  const counter = { queries: 0 };
  const wrapped: DataSource<T> = {
    ...source,
    query: (request) => {
      counter.queries += 1;
      return source.query(request);
    },
  };
  return { source: wrapped, counter };
};

const mount = async <T>(source: DataSource<T>, options: Partial<GridCoreOptions<T>> = {}) => {
  const rejections: RowGroupingRejection[] = [];
  const grid = new GridCore<T>({
    columns,
    dataSource: source,
    rowHeight: 30,
    headerHeight: 30,
    getRowId: (row) => (row as Sale).id,
    rowGrouping: createRowGrouping(config),
    onRowGroupingRejected: (rejection) => rejections.push(rejection),
    ...options,
  });
  await grid.initialize();
  grid.setViewport(0, 0, 400, 600);
  return { grid, rejections };
};

type Grid = Awaited<ReturnType<typeof mount>>["grid"];

/** One label per view row: the total, a group's key indented by depth, or a record id. */
const view = (grid: Grid): string[] =>
  Array.from({ length: grid.rows.getCount() }, (_, index) => {
    const row = grid.rows.getViewRow(index);
    if (row?.kind === "group") return `${"-".repeat(row.depth)}${String(row.value)}`;
    if (row?.kind === "total") return "total";
    return String(row?.id);
  });

const indexOf = (grid: Grid, label: string) => view(grid).indexOf(label);

const groupId = (grid: Grid, label: string) => grid.rows.getId(indexOf(grid, label))!;

const editCell = (grid: Grid, row: number, col: number, value: string | number) => {
  expect(grid.edit.start(row, col)).toBe(true);
  grid.edit.updateValue(value);
  grid.edit.commit();
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("row grouping — expansion (AC-008-01)", () => {
  it("starts collapsed, and a toggle issues no query", async () => {
    const { source, counter } = counted(createClientDataSource(copySales(), { useWorker: false }));
    const { grid } = await mount(source);
    expect(grid.rowGroups.isActive()).toBe(true);
    expect(view(grid)).toEqual(["total", "DE", "FR", "IT"]);
    const queries = counter.queries;

    expect(grid.rowGroups.toggle(groupId(grid, "IT"))).toEqual({ status: "applied" });
    expect(grid.rowGroups.toggle(groupId(grid, "-Rome"))).toEqual({ status: "applied" });
    expect(view(grid)).toEqual(["total", "DE", "FR", "IT", "-Milan", "-Rome", "1", "2"]);
    expect(grid.cells.getFieldValue(0, "sum")).toBe(112);
    expect(grid.cells.getFieldValue(indexOf(grid, "IT"), "amount")).toBe(30);
    expect(counter.queries).toBe(queries);
  });
});

describe("row grouping — rebuilds", () => {
  it("regroups a filter over the filtered rows and keeps surviving expansion", async () => {
    const { grid } = await mount(createClientDataSource(copySales(), { useWorker: false }));
    grid.rowGroups.setExpanded([groupId(grid, "IT"), groupId(grid, "FR")], true);

    await grid.sortFilter.setFilter("city", "o");

    expect(view(grid)).toEqual(["total", "FR", "-Lyon", "IT", "-Rome"]);
    expect(grid.cells.getFieldValue(0, "sum")).toBe(80);
  });

  it("orders groups by a sorted dimension and by a sorted measure (D9)", async () => {
    const { grid } = await mount(createClientDataSource(copySales(), { useWorker: false }));

    await grid.sortFilter.setSort("country", "desc");
    expect(view(grid)).toEqual(["total", "IT", "FR", "DE"]);

    await grid.sortFilter.setSort("amount", "asc");
    expect(view(grid)).toEqual(["total", "DE", "IT", "FR"]);
  });

  it("rebuilds after a transaction and keeps surviving expansion", async () => {
    const source = createMutableClientDataSource<Sale>(copySales(), { getRowId: (row) => row.id });
    const { grid } = await mount(source);
    grid.rowGroups.setExpanded([groupId(grid, "IT")], true);

    source.addRows([{ id: 7, country: "ES", city: "Madrid", amount: 1 }]);
    await source.flushTransactions();
    await grid.refreshFromTransaction();

    expect(view(grid)).toEqual(["total", "DE", "ES", "FR", "IT", "-Milan", "-Rome"]);
    expect(grid.cells.getFieldValue(0, "sum")).toBe(113);
  });
});

describe("row grouping — leaf edits (AC-008-03, AC-008-04)", () => {
  it("writes a measure edit to the record and refolds its path, lowering the maximum", async () => {
    const sales = copySales();
    const { grid } = await mount(createClientDataSource(sales, { useWorker: false }));
    grid.rowGroups.setExpanded(null, true);
    const lyon = indexOf(grid, "5");

    editCell(grid, lyon, AMOUNT, 1);

    expect(sales[4]!.amount).toBe(1);
    expect(grid.cells.getFieldValue(indexOf(grid, "-Lyon"), "amount")).toBe(1);
    expect(grid.cells.getFieldValue(indexOf(grid, "FR"), "amount")).toBe(5);
    expect(grid.cells.getFieldValue(0, "amount")).toBe(30);
    expect(grid.cells.getFieldValue(0, "sum")).toBe(73);
    expect(view(grid)[lyon]).toBe("5");
  });

  it("moves a record whose dimension is edited, expanding its new group, and the active cell follows it", async () => {
    const toggled = vi.fn();
    const grouping = createRowGrouping(config);
    const options = { rowGrouping: grouping, onRowGroupToggled: toggled };
    const { grid } = await mount(createClientDataSource(copySales(), { useWorker: false }), options);
    grid.rowGroups.setExpanded([groupId(grid, "DE")], true);
    grid.rowGroups.setExpanded([groupId(grid, "-Berlin")], true);
    const berlin = indexOf(grid, "6");
    grid.selection.setActiveCell(berlin, COUNTRY);

    editCell(grid, berlin, COUNTRY, "FR");

    expect(view(grid)).toEqual(["total", "FR", "-Berlin", "6", "-Lyon", "-Paris", "IT"]);
    expect(grid.selection.getActiveCell()).toEqual({ row: indexOf(grid, "6"), col: COUNTRY });
    expect(grouping.getState().expanded).toEqual(expect.arrayContaining([groupId(grid, "FR"), groupId(grid, "-Berlin")]));
    expect(toggled).not.toHaveBeenCalled();
  });

  it("expands the collapsed group a record moves into when that group already exists", async () => {
    const byCountry = createRowGrouping({ ...config, dimensions: [{ field: "country" }] });
    const { grid } = await mount(createClientDataSource(copySales(), { useWorker: false }), { rowGrouping: byCountry });
    grid.rowGroups.setExpanded([groupId(grid, "DE")], true);
    const berlin = indexOf(grid, "6");
    grid.selection.setActiveCell(berlin, COUNTRY);

    editCell(grid, berlin, COUNTRY, "IT");

    expect(view(grid)).toEqual(["total", "FR", "IT", "1", "2", "3", "6"]);
    expect(grid.selection.getActiveCell()).toEqual({ row: indexOf(grid, "6"), col: COUNTRY });
    expect(byCountry.getState().expanded).toContain(groupId(grid, "IT"));
  });
});

describe("row grouping — partial sources (AC-008-07)", () => {
  it("rejects a paginated source and renders flat", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { grid, rejections } = await mount(createClientDataSource(copySales(), { useWorker: false }), {
      rowLoading: { mode: "paginated" },
    });
    expect(grid.rowGroups.isActive()).toBe(false);
    expect(rejections).toEqual([{ reason: "partial-source" }]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("rejects a response shorter than its total and renders flat", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const short: DataSource<Sale> = {
      query: async () => ({ rows: copySales().slice(0, 4), totalRows: 6 }),
    };
    const { grid, rejections } = await mount(short);
    expect(grid.rowGroups.isActive()).toBe(false);
    expect(grid.rows.getCount()).toBe(6);
    expect(rejections).toEqual([{ reason: "partial-source" }]);
  });

  it("reports every rejected load and warns once per reason per grid, across groupings", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const short: DataSource<Sale> = {
      query: async () => ({ rows: copySales().slice(0, 4), totalRows: 6 }),
    };
    const { grid, rejections } = await mount(short);
    await grid.refresh();
    grid.rowGroups.setGrouping(createRowGrouping({ dimensions: [{ field: "city" }] }));

    expect(rejections).toEqual(Array(3).fill({ reason: "partial-source" }));
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("row grouping — other rejections and setGrouping", () => {
  it("rejects an unknown field and a hierarchical source", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const unknown = await mount(createClientDataSource(copySales(), { useWorker: false }), {
      rowGrouping: createRowGrouping({ dimensions: [{ field: "region" }] }),
    });
    expect(unknown.grid.rowGroups.isActive()).toBe(false);
    expect(unknown.rejections).toEqual([{ reason: "unknown-field", field: "region" }]);

    const external = await mount(createHierarchySource(() => createHierarchyFixture()));
    expect(external.rejections).toEqual([{ reason: "hierarchical-source" }]);
    expect(external.grid.rows.getId(1)).toBe("g:IT");
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("returns to the flat rows with setGrouping(null) and regroups with no query", async () => {
    const { source, counter } = counted(createClientDataSource(copySales(), { useWorker: false }));
    const { grid } = await mount(source);
    const queries = counter.queries;

    expect(grid.rowGroups.setGrouping(null)).toEqual({ status: "applied" });
    expect(grid.rowGroups.isActive()).toBe(false);
    expect(view(grid)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(grid.rowGroups.setGrouping(null)).toEqual({ status: "unchanged" });

    const byCountry = createRowGrouping({ dimensions: [{ field: "country" }], defaultExpandedDepth: 1 });
    expect(grid.rowGroups.setGrouping(byCountry)).toEqual({ status: "applied" });
    expect(view(grid)).toEqual(["DE", "6", "FR", "4", "5", "IT", "1", "2", "3"]);
    expect(grid.rowGroups.setGrouping(byCountry)).toEqual({ status: "unchanged" });
    expect(counter.queries).toBe(queries);
  });

  it("reports a rejected setGrouping and leaves the grid flat", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { grid, rejections } = await mount(createClientDataSource(copySales(), { useWorker: false }));

    const result = grid.rowGroups.setGrouping(createRowGrouping({ dimensions: [{ field: "nope" }] }));

    const rejection = { reason: "unknown-field", field: "nope" };
    expect(result).toEqual({ status: "rejected", rejection });
    expect(rejections).toEqual([rejection]);
    expect(grid.rowGroups.isActive()).toBe(false);
    expect(grid.rows.getCount()).toBe(6);
  });
});

describe("row grouping — columnar", () => {
  it("groups without getRecord and refuses edits", async () => {
    const source = createColumnarDataSource({
      fields: (["id", "country", "city", "amount"] as const).map((field) => ({
        field,
        data: SALES.map((sale) => sale[field]),
      })),
      getRowId: (row) => SALES[row]!.id,
    });
    const getRecord = vi.spyOn(source, "getRecord");
    const { grid } = await mount(source as DataSource<unknown>, { getRowId: undefined });
    grid.rowGroups.setExpanded(null, true);

    expect(view(grid).slice(0, 4)).toEqual(["total", "DE", "-Berlin", "6"]);
    expect(grid.cells.getFieldValue(0, "sum")).toBe(112);
    expect(grid.rows.getData(3)).toBeUndefined();
    expect(grid.edit.start(3, AMOUNT)).toBe(false);
    expect(getRecord).not.toHaveBeenCalled();
  });
});
