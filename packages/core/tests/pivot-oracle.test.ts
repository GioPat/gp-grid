// PRD 012 AC-012-01: createPivotSource against a reference pivot that filters seeded rows directly.

import { describe, expect, it } from "vitest";
import { createClientDataSource, createColumnarDataSource } from "../src/data-source";
import { PIVOT_LABEL_COLUMN_ID, decodePivotColumnId, encodePivotColumnId } from "../src/hierarchy/pivot-ids";
import { createPivotSource } from "../src/pivot";
import type {
  CellValue,
  DataSource,
  HierarchicalRowAccess,
  PivotConfig,
  PivotMeasure,
  PivotSource,
  SortModel,
} from "../src/types";
import {
  ORACLE_FIELDS,
  REDUCERS,
  makeOracleRows,
  referencePivot,
  referenceTuples,
  spreadAggregator,
  type OracleMeasure,
  type OracleRow,
  type ReferenceTable,
} from "./pivot-oracle";

const SEEDS = [1, 7, 42, 2024, 9001];

interface Case {
  readonly aggregate: PivotMeasure["aggregate"];
  readonly reduce: OracleMeasure["reduce"];
}

const CASES: Record<string, Case> = {
  sum: { aggregate: "sum", reduce: REDUCERS.sum },
  count: { aggregate: "count", reduce: REDUCERS.count },
  avg: { aggregate: "avg", reduce: REDUCERS.avg },
  min: { aggregate: "min", reduce: REDUCERS.min },
  max: { aggregate: "max", reduce: REDUCERS.max },
  "custom with merge": { aggregate: spreadAggregator(true), reduce: REDUCERS.spread },
  "custom without merge": { aggregate: spreadAggregator(false), reduce: REDUCERS.spread },
};

/** One measure over each source field, so integer and floating point folds both run. */
const measuresOf = ({ aggregate, reduce }: Case): OracleMeasure[] & PivotMeasure[] => [
  { field: "a", source: "amount", aggregate, reduce },
  { field: "s", source: "score", aggregate, reduce },
];

const configOf = (measures: readonly PivotMeasure[], domain?: readonly string[]): PivotConfig => ({
  rows: [{ field: "region" }, { field: "city" }],
  pivots: [{ field: "year" }, { field: "quarter" }],
  measures: measures.map(({ field, source, aggregate }) => ({ field, source, aggregate })),
  rowTotals: true,
  grandTotal: "top",
  ...(domain && { domain: { quarter: domain } }),
});

const objects = (rows: OracleRow[]) => createClientDataSource(rows, { useWorker: false });
const columnar = (rows: OracleRow[]) =>
  createColumnarDataSource({ fields: ORACLE_FIELDS.map((field) => ({ field, data: rows.map((row) => row[field]!) })) });

/** Every row expanded, each as its id and the values of every generated column in schema order. */
const pivotTable = async (inner: DataSource<unknown>, config: PivotConfig, sort?: SortModel): Promise<ReferenceTable> => {
  const source: PivotSource<unknown> = createPivotSource(inner, config);
  const response = await source.query({ range: { startRow: 0, endRow: 1000 }, sort: sort && [sort] });
  const access = response.access as HierarchicalRowAccess;
  access.setExpanded!(null, true);
  const columns = source.getSchema()!.columns.map((column) => column.colId!);
  expect(columns[0]).toBe(PIVOT_LABEL_COLUMN_ID);
  const generated = columns.slice(1);
  const rows = Array.from({ length: access.rowCount }, (_, row) => ({
    id: String(access.getRowId(row)),
    values: generated.map((column) => access.getValue(row, column)),
  }));
  return { columns: generated, rows };
};

const close = (actual: CellValue, expected: CellValue): boolean => {
  if (typeof actual === "number" && typeof expected === "number") {
    return Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected));
  }
  return actual === expected;
};

/** Every cell that differs, as `row id | column id: actual != expected`. */
const mismatches = (actual: ReferenceTable, expected: ReferenceTable): string[] =>
  expected.rows.flatMap((row, index) =>
    row.values.flatMap((value, column) => {
      const got = actual.rows[index]?.values[column];
      return close(got ?? null, value) ? [] : [`${row.id} | ${expected.columns[column]}: ${got} != ${value}`];
    }),
  );

const expectTable = (actual: ReferenceTable, expected: ReferenceTable) => {
  expect(actual.columns).toEqual(expected.columns);
  expect(actual.rows.map((row) => row.id)).toEqual(expected.rows.map((row) => row.id));
  expect(mismatches(actual, expected)).toEqual([]);
};

const column = (table: ReferenceTable, id: string, row: number): CellValue =>
  table.rows[row]!.values[table.columns.indexOf(id)] ?? null;

describe.each(SEEDS)("pivot oracle, seed %i", (seed) => {
  const rows = makeOracleRows(seed);

  it.each(Object.keys(CASES))("answers every cell, row total and grand total with %s", async (name) => {
    const measures = measuresOf(CASES[name]!);
    expectTable(await pivotTable(objects(rows), configOf(measures)), referencePivot(rows, { measures }));
  });

  it.each(["sum", "count"])("partitions each %s row total over its disjoint leaf tuples", async (name) => {
    const table = await pivotTable(objects(rows), configOf(measuresOf(CASES[name]!)));
    const total = table.columns.indexOf(encodePivotColumnId([], "a"));
    const cells = table.columns.flatMap((id, index) => (decodePivotColumnId(id)?.path.length && id.endsWith("|a") ? [index] : []));
    for (const row of table.rows) {
      const sum = cells.reduce((acc, index) => acc + Number(row.values[index] ?? 0), 0);
      expect(sum).toBe(Number(row.values[total] ?? 0));
    }
  });

  it("takes avg as sum over count, not as the mean of the cells' means", async () => {
    const measures: PivotMeasure[] = [
      { field: "sum", source: "amount", aggregate: "sum" },
      { field: "count", source: "amount", aggregate: "count" },
      { field: "avg", source: "amount", aggregate: "avg" },
    ];
    const table = await pivotTable(objects(rows), configOf(measures));
    const total = (measure: string, row: number) => column(table, encodePivotColumnId([], measure), row);
    const cellIds = table.columns.filter((id) => id.endsWith("|avg") && decodePivotColumnId(id)!.path.length > 0);
    const meanOfMeans = table.rows.map((_, index) => {
      const means = cellIds.map((id) => column(table, id, index)).filter((value): value is number => value !== null);
      return means.reduce((a, b) => a + b, 0) / means.length;
    });
    const sumOverCount = table.rows.map((_, index) => {
      const count = Number(total("count", index));
      return count === 0 ? null : Number(total("sum", index)) / count;
    });
    expect(table.rows.filter((_, index) => close(total("avg", index), sumOverCount[index]!) === false)).toEqual([]);
    expect(meanOfMeans.some((mean, index) => sumOverCount[index] !== null && close(mean, total("avg", index)) === false)).toBe(true);
  });

  it("gives equal results over object rows and a columnar access", async () => {
    const config = configOf(measuresOf(CASES.avg!));
    expect(await pivotTable(columnar(rows), config)).toEqual(await pivotTable(objects(rows), config));
  });

  describe("order of the row groups", () => {
    const measures = [...measuresOf(CASES.sum!), { field: "n", source: "amount", aggregate: "count" as const, reduce: REDUCERS.count }];
    const [firstTuple] = referenceTuples(rows);
    it.each<[string, SortModel | undefined]>([
      ["no sort", undefined],
      ["a generated column ascending", { colId: encodePivotColumnId(firstTuple!, "a"), direction: "asc" }],
      ["a generated column descending", { colId: encodePivotColumnId(firstTuple!, "n"), direction: "desc" }],
      ["a row total ascending", { colId: encodePivotColumnId([], "a"), direction: "asc" }],
      ["a row total descending", { colId: encodePivotColumnId([], "n"), direction: "desc" }],
      ["the label column ascending", { colId: PIVOT_LABEL_COLUMN_ID, direction: "asc" }],
      ["the label column descending", { colId: PIVOT_LABEL_COLUMN_ID, direction: "desc" }],
    ])("follows the reference under %s", async (_, sort) => {
      expectTable(await pivotTable(objects(rows), configOf(measures), sort), referencePivot(rows, { measures, sort }));
    });
  });

  it("shows a domain's keys as the columns and folds out-of-domain rows into the totals only", async () => {
    const domain = ["Q3", "Q1", "Q9", "Q1"];
    const measures = [...measuresOf(CASES.sum!), { field: "n", source: "amount", aggregate: "count" as const, reduce: REDUCERS.count }];
    const table = await pivotTable(objects(rows), configOf(measures, domain));
    expectTable(table, referencePivot(rows, { measures, domain }));
    const quarters = new Set(table.columns.flatMap((id) => decodePivotColumnId(id)!.path.slice(1).map((step) => step[2])));
    expect([...quarters]).toEqual(["Q3", "Q1", "Q9"]);
    const inDomain = rows.filter((row) => row.amount !== null && ["Q1", "Q3"].includes(row.quarter)).length;
    const counted = table.columns.filter((id) => id.endsWith("|n") && decodePivotColumnId(id)!.path.length > 0);
    expect(counted.reduce((acc, id) => acc + Number(column(table, id, 0) ?? 0), 0)).toBe(inDomain);
    expect(column(table, encodePivotColumnId([], "n"), 0)).toBe(rows.filter((row) => row.amount !== null).length);
  });
});
