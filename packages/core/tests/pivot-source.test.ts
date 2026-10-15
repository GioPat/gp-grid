// PRD 012 D3, D4: createPivotSource's configuration, queries, rejections, schema, expansion and teardown.

import { describe, expect, it, vi } from "vitest";
import { createClientDataSource, createColumnarDataSource } from "../src/data-source";
import { encodeGroupId } from "../src/hierarchy/group-path";
import { PIVOT_LABEL_COLUMN_ID, encodePivotColumnId } from "../src/hierarchy/pivot-ids";
import { createPivotSource } from "../src/pivot";
import type {
  CellValue,
  DataSource,
  DataSourceRequest,
  FilterCondition,
  FilterModel,
  HierarchicalRowAccess,
  PivotConfig,
  PivotSource,
  SortModel,
} from "../src/types";
import { SALES, SALE_FIELDS, type Sale } from "./pivot-sales";

const CONFIG: PivotConfig = {
  rows: [{ field: "region" }, { field: "city" }],
  pivots: [{ field: "year" }, { field: "quarter" }],
  measures: [
    { field: "amount", aggregate: "sum" },
    { field: "n", source: "amount", aggregate: "count" },
  ],
  rowTotals: true,
  grandTotal: "top",
  defaultExpandedDepth: 1,
};

const objects = (rows: Sale[] = SALES) => createClientDataSource(rows, { useWorker: false });
const columnar = (fields = SALE_FIELDS) =>
  createColumnarDataSource({ fields: fields.map((field) => ({ field, data: SALES.map((sale) => sale[field]!) })) });
const pivot = (source: DataSource<unknown>, config: Partial<PivotConfig> = {}) =>
  createPivotSource(source, { ...CONFIG, ...config });

const query = async (source: PivotSource<unknown>, sort?: SortModel[]) => {
  const response = await source.query({ range: { startRow: 0, endRow: 100 }, sort });
  return response.access as HierarchicalRowAccess;
};

const labelOf = (access: HierarchicalRowAccess, row: number): CellValue => {
  const view = access.getRow(row)!;
  return view.kind === "group" ? view.value : view.kind;
};

/** Each view row as its label, then every generated column's value in schema order. */
const cells = (source: PivotSource<unknown>, access: HierarchicalRowAccess) => {
  const ids = source.getSchema()!.columns.map((column) => column.colId!).slice(1);
  return Array.from({ length: access.rowCount }, (_, row) => [
    labelOf(access, row),
    ...ids.map((id) => access.getValue(row, id)),
  ]);
};

const labels = (access: HierarchicalRowAccess) => Array.from({ length: access.rowCount }, (_, row) => labelOf(access, row));

const NORTH = encodeGroupId([["region", "s", "North"]]);
const OSLO = encodeGroupId([["region", "s", "North"], ["city", "s", "Oslo"]]);
const TOTAL_AMOUNT = encodePivotColumnId([], "amount");
const Q1_2025_AMOUNT = encodePivotColumnId([["year", "n", 2025], ["quarter", "s", "Q1"]], "amount");

// Columns: 2024/Q1, 2024/Q2, 2025/Q1, then the row totals; amount then count in each.
const EXPECTED = [
  ["total", 15, 2, 23, 2, 17, 3, 55, 7],
  ["North", 15, 2, 20, 1, 7, 1, 42, 4],
  ["Bergen", 5, 1, null, null, 7, 1, 12, 2],
  ["Oslo", 10, 1, 20, 1, null, null, 30, 2],
  ["South", null, null, 3, 1, 10, 2, 13, 3],
  ["Rome", null, null, 3, 1, 10, 2, 13, 3],
];

describe("createPivotSource configuration", () => {
  it.each<[string, Partial<PivotConfig>]>([
    ["Invalid pivot.rows: []", { rows: [] }],
    ["Invalid pivot.pivots: []", { pivots: [] }],
    ["Invalid pivot.measures: []", { measures: [] }],
    ["Invalid pivot.pivots.id: region", { pivots: [{ field: "year", id: "region" }] }],
    ["Invalid pivot.rows.id: city", { rows: [{ field: "city" }, { field: "city" }] }],
    ["Invalid pivot.measures.field: a", { measures: [{ field: "a", aggregate: "sum" }, { field: "a", aggregate: "max" }] }],
    ["Invalid pivot.measures.aggregate: median", { measures: [{ field: "a", aggregate: "median" as "sum" }] }],
    ["Invalid pivot.defaultExpandedDepth: -1", { defaultExpandedDepth: -1 }],
    ["Invalid pivot.maxColumns: 0", { maxColumns: 0 }],
    ["Invalid pivot.domain: region", { domain: { region: ["North"] } }],
    ["Invalid pivot.domain.year: [object Object]", { domain: { year: [2024, {} as CellValue] } }],
  ])("throws %s", (message, config) => {
    expect(() => pivot(objects(), config)).toThrow(new RangeError(message));
  });

  it("accepts a Date in a domain and is read-only and loads everything", () => {
    const source = pivot(objects(), { domain: { year: [new Date(0)] } });
    expect([source.loadMode, source.writable, source.getSchema()]).toEqual(["all", false, null]);
    expect("getRecordById" in source || "moveRow" in source).toBe(false);
  });
});

describe("createPivotSource queries", () => {
  it("asks the inner source for every row under the filter, without sort", async () => {
    const inner = objects();
    const spy = vi.spyOn(inner, "query");
    const condition: FilterCondition = { type: "text", operator: "equals", value: "South" };
    const filter: FilterModel = { region: { groups: [{ conditions: [condition], combination: "and" }], combination: "and" } };
    const source = pivot(inner);
    await source.query({ range: { startRow: 0, endRow: 10 }, sort: [{ colId: "region", direction: "asc" }], filter });
    const request: DataSourceRequest = spy.mock.calls[0]![0];
    expect(request.range).toEqual({ startRow: 0, endRow: Number.MAX_SAFE_INTEGER });
    expect(request.sort).toBeUndefined();
    expect(request.filter).toBe(filter);
  });

  it("answers values, row totals and the grand total from object and columnar rows alike", async () => {
    const fromObjects = pivot(objects());
    const fromColumns = pivot(columnar());
    const access = await query(fromObjects);
    expect(cells(fromObjects, access)).toEqual(EXPECTED);
    expect(cells(fromColumns, await query(fromColumns))).toEqual(EXPECTED);
    expect(access.getValue(1, PIVOT_LABEL_COLUMN_ID)).toBeNull();
    expect(access.getValue(1, "amount")).toBeNull();
    expect(access.getValue(99, TOTAL_AMOUNT)).toBeNull();
  });

  it("reports group rows with childless terminals, ids and locate", async () => {
    const access = await query(pivot(objects()));
    expect(access.getRow(1)).toMatchObject({ kind: "group", id: NORTH, childCount: 2, leafCount: 4, expanded: true });
    expect(access.getRow(3)).toMatchObject({ kind: "group", id: OSLO, childCount: 0, leafCount: 2, expanded: false });
    expect(access.getRow(0)).toEqual({ kind: "total", id: "gp-total", depth: 0, leafCount: 7 });
    expect([access.getRowId(0), access.getRowId(3)]).toEqual(["gp-total", OSLO]);
    expect([access.locate("gp-total"), access.locate(OSLO), access.locate(5), access.locate("x")]).toEqual([0, 3, -1, -1]);
  });

  it.each<[string, () => DataSource<unknown>, string]>([
    ["a paginated source", () => ({ loadMode: "paginated", query: objects().query }), "pivot needs every row"],
    ["a partial response", () => ({ query: async () => ({ rows: [SALES[0]], totalRows: 7 }) }), "pivot needs every row"],
    ["a columnar source without a field", () => columnar(["region", "city", "year", "amount"]), "pivot reads unknown field quarter"],
    [
      "an object pivot key",
      () => objects(SALES.map((sale) => ({ ...sale, year: {} as CellValue as number }))),
      "pivot key of year is an object; add toKey",
    ],
    [
      "an object row key",
      () => objects(SALES.map((sale) => ({ ...sale, city: {} as CellValue as string }))),
      "pivot key of city is an object; add toKey",
    ],
  ])("rejects %s", async (_, inner, message) => {
    await expect(pivot(inner()).query({ range: { startRow: 0, endRow: 1 } })).rejects.toThrow(new Error(message));
  });

  it("rejects a schema over maxColumns, row totals counted", async () => {
    await expect(query(pivot(objects(), { maxColumns: 7 }))).rejects.toThrow("pivot generates 8 columns, over maxColumns 7");
    await expect(query(pivot(objects(), { maxColumns: 6, rowTotals: false }))).resolves.toBeDefined();
  });
});

describe("createPivotSource schema and expansion", () => {
  it("notifies listeners once per schema change, before the query resolves", async () => {
    const rows = [...SALES];
    const source = pivot(objects(rows));
    const seen: number[] = [];
    const listener = vi.fn((schema) => seen.push(schema.columns.length));
    const stop = source.subscribeSchema(listener);
    await query(source);
    await query(source);
    expect(seen).toEqual([9]);
    rows.push({ ...SALES[0]!, year: 2026 });
    await query(source);
    expect(seen).toEqual([9, 11]);
    expect(source.getSchema()!.columns).toHaveLength(11);
    stop();
    rows.pop();
    await query(source);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(source.getSchema()!.columns).toHaveLength(9);
  });

  it("keeps expansion by id across queries and reports it", async () => {
    const source = pivot(objects(), { defaultExpandedDepth: 0 });
    const first = await query(source);
    expect(labels(first)).toEqual(["total", "North", "South"]);
    expect(first.setExpanded!([NORTH], true)).toBe(true);
    expect(labels(first)).toEqual(["total", "North", "Bergen", "Oslo", "South"]);
    expect(source.getState()).toEqual({ expanded: [NORTH], collapsed: [] });
    expect(labels(await query(source))).toEqual(["total", "North", "Bergen", "Oslo", "South"]);
  });

  it("ignores terminal groups and opens every non-terminal one on null", async () => {
    const source = pivot(objects(), { defaultExpandedDepth: 0, initialState: { expanded: [OSLO], collapsed: [] } });
    const access = await query(source);
    expect(access.setExpanded!([OSLO], true)).toBe(false);
    expect(access.setExpanded!(null, true)).toBe(true);
    expect(labels(access)).toEqual(["total", "North", "Bergen", "Oslo", "South", "Rome"]);
    expect(access.getRow(3)).toMatchObject({ expanded: false, childCount: 0 });
    expect(labels(await query(source))).toEqual(["total", "North", "Bergen", "Oslo", "South", "Rome"]);
  });

  it("treats a default depth past the last row level as that level", async () => {
    const source = pivot(objects(), { defaultExpandedDepth: 5, grandTotal: "bottom" });
    const access = await query(source);
    expect(labels(access)).toEqual(["North", "Bergen", "Oslo", "South", "Rome", "total"]);
    expect(source.getState()).toEqual({ expanded: [], collapsed: [] });
  });
});

describe("createPivotSource order", () => {
  it.each<[string, SortModel[], CellValue[]]>([
    ["keys ascending by default", [], ["total", "North", "Bergen", "Oslo", "South", "Rome"]],
    ["a sorted row total", [{ colId: TOTAL_AMOUNT, direction: "desc" }], ["total", "North", "Oslo", "Bergen", "South", "Rome"]],
    ["a sorted generated column", [{ colId: Q1_2025_AMOUNT, direction: "desc" }], ["total", "South", "Rome", "North", "Oslo", "Bergen"]],
    ["the label column", [{ colId: PIVOT_LABEL_COLUMN_ID, direction: "desc" }], ["total", "South", "Rome", "North", "Oslo", "Bergen"]],
    [
      "the first sorted entry",
      [
        { colId: "unknown", direction: "desc" },
        { colId: TOTAL_AMOUNT, direction: null },
        { colId: TOTAL_AMOUNT, direction: "asc" },
        { colId: PIVOT_LABEL_COLUMN_ID, direction: "desc" },
      ],
      ["total", "South", "Rome", "North", "Bergen", "Oslo"],
    ],
  ])("orders by %s", async (_, sort, expected) => {
    expect(labels(await query(pivot(objects()), sort))).toEqual(expected);
  });
});

describe("createPivotSource destroy", () => {
  it("silences listeners, releases the view and rejects later queries", async () => {
    const source = pivot(objects());
    const listener = vi.fn();
    source.subscribeSchema(listener);
    const access = await query(source);
    source.destroy();
    expect(access.rowCount).toBe(0);
    expect(access.getValue(0, TOTAL_AMOUNT)).toBeNull();
    expect(access.setExpanded!(null, true)).toBe(false);
    await expect(query(source)).rejects.toThrow("pivot source destroyed");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("createPivotSource budget", () => {
  /** Object rows that count reads of each field. */
  const counted = () => {
    const reads = new Map<string, number>();
    const rows = SALES.map(
      (sale) =>
        new Proxy(sale, {
          get: (target, field, receiver) => {
            if (typeof field === "string") reads.set(field, (reads.get(field) ?? 0) + 1);
            return Reflect.get(target, field, receiver);
          },
        }),
    );
    return { inner: objects(rows), reads };
  };

  it("rejects over maxColumns before any measure is read", async () => {
    const { inner, reads } = counted();
    await expect(query(pivot(inner, { maxColumns: 7 }))).rejects.toThrow(
      new Error("pivot generates 8 columns, over maxColumns 7"),
    );
    expect(reads.get("year")).toBeGreaterThan(0);
    expect(reads.get("amount") ?? 0).toBe(0);
    await query(pivot(inner, { maxColumns: 8 }));
    expect(reads.get("amount")).toBeGreaterThan(0);
  });

  it("counts domain keys without rows toward the budget", async () => {
    const domain = { quarter: ["Q1", "Q2", "Q3", "Q4"] };
    await expect(query(pivot(objects(), { domain, maxColumns: 17 }))).rejects.toThrow(
      new Error("pivot generates 18 columns, over maxColumns 17"),
    );
    const source = pivot(objects(), { domain, maxColumns: 18 });
    await query(source);
    expect(source.getSchema()!.columns).toHaveLength(19);
  });

  it("accepts a schema exactly at the limit", async () => {
    const source = pivot(objects(), { maxColumns: 8 });
    await query(source);
    expect(source.getSchema()!.columns).toHaveLength(9);
  });
});
