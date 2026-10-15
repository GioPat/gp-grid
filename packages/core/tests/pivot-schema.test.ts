// PRD 012 D2: the pivot schema helper over ordered leaf tuples.

import { describe, expect, it } from "vitest";
import { buildPivotSchema } from "../src/hierarchy/pivot-schema";
import { PIVOT_LABEL_COLUMN_ID, encodePivotColumnId, encodePivotGroupId } from "../src/hierarchy/pivot-ids";
import { buildGroupIndex } from "../src/column-groups";
import { DEFAULT_COLUMN_GROUP_LIMITS } from "../src/grid-core-config";
import type { ColumnGroupChild, GroupPathStep, PivotMeasure, PivotSchema, PivotSchemaOptions } from "../src/types";

const amount: PivotMeasure = { field: "amount", aggregate: "sum" };
const count: PivotMeasure = { field: "count", aggregate: "count" };
const measures = [amount, count];

const y = (key: number): GroupPathStep => ["year", "n", key];
const q = (key: string): GroupPathStep => ["quarter", "s", key];
const col = (path: readonly GroupPathStep[], measure: string) => encodePivotColumnId(path, measure);
const grp = (path: readonly GroupPathStep[]) => encodePivotGroupId(path);

const build = (keys: readonly (readonly GroupPathStep[])[], options: Partial<PivotSchemaOptions> = {}): PivotSchema => {
  const schema = buildPivotSchema(keys, { measures, ...options });
  const ids = schema.columns.map((column) => column.colId!);
  expect(buildGroupIndex(schema.columnGroups, ids, DEFAULT_COLUMN_GROUP_LIMITS).ok).toBe(true);
  return schema;
};

/** The groups as `[groupId, headerName, children]`, leaves as their ids. */
const shape = (children: readonly ColumnGroupChild[]): unknown[] =>
  children.map((child) =>
    typeof child === "string" ? child : [child.groupId, child.headerName, shape(child.children)],
  );

describe("buildPivotSchema — structure", () => {
  it("nests one pivot level with two measures, in measure order inside each tuple", () => {
    const schema = build([[y(2024)], [y(2025)]]);
    expect(schema.columns.map((column) => column.colId)).toEqual([
      PIVOT_LABEL_COLUMN_ID,
      col([y(2024)], "amount"), col([y(2024)], "count"),
      col([y(2025)], "amount"), col([y(2025)], "count"),
    ]);
    expect(shape(schema.columnGroups)).toEqual([
      PIVOT_LABEL_COLUMN_ID,
      [grp([y(2024)]), "2024", [col([y(2024)], "amount"), col([y(2024)], "count")]],
      [grp([y(2025)]), "2025", [col([y(2025)], "amount"), col([y(2025)], "count")]],
    ]);
  });

  it("nests two pivot levels under one group per prefix", () => {
    const keys = [[y(2024), q("Q1")], [y(2024), q("Q2")], [y(2025), q("Q1")]];
    const schema = build(keys, { measures: [count, amount] });
    const leaves = (path: GroupPathStep[]) => [col(path, "count"), col(path, "amount")];
    expect(shape(schema.columnGroups)).toEqual([
      PIVOT_LABEL_COLUMN_ID,
      [grp([y(2024)]), "2024", [
        [grp([y(2024), q("Q1")]), "Q1", leaves([y(2024), q("Q1")])],
        [grp([y(2024), q("Q2")]), "Q2", leaves([y(2024), q("Q2")])],
      ]],
      [grp([y(2025)]), "2025", [[grp([y(2025), q("Q1")]), "Q1", leaves([y(2025), q("Q1")])]]],
    ]);
    expect(schema.columns).toHaveLength(7);
  });

  it("is the label column alone without keys", () => {
    expect(build([])).toEqual({ columns: [expect.objectContaining({ colId: PIVOT_LABEL_COLUMN_ID })], columnGroups: [PIVOT_LABEL_COLUMN_ID] });
  });

  it("heads the row totals group with rowTotalsHeader", () => {
    const schema = build([[y(2024)]], { rowTotals: true, rowTotalsHeader: "Totale" });
    expect(shape(schema.columnGroups).at(-1)).toEqual(["gp-pivot-group:[]", "Totale", expect.any(Array)]);
  });

  it("adds one row total per measure under the Total group", () => {
    const schema = build([[y(2024)]], { rowTotals: true });
    expect(schema.columns.slice(-2).map((column) => column.colId)).toEqual([col([], "amount"), col([], "count")]);
    expect(shape(schema.columnGroups).at(-1)).toEqual([
      "gp-pivot-group:[]", "Total", ["gp-pivot:[]|amount", "gp-pivot:[]|count"],
    ]);
  });
});

describe("buildPivotSchema — column definitions", () => {
  it("gives the label column and a generated column their defaults", () => {
    const [label, generated] = build([[y(2024)]]).columns;
    expect(label).toEqual({
      colId: PIVOT_LABEL_COLUMN_ID, field: PIVOT_LABEL_COLUMN_ID, headerName: "", width: 200, cellDataType: "text",
      filterable: false,
    });
    const id = col([y(2024)], "amount");
    expect(generated).toEqual({
      colId: id, field: id, headerName: "amount", cellDataType: "number", width: 120, editable: false, filterable: false,
    });
  });

  it("applies column overrides but keeps colId, field, editable and filterable", () => {
    const column = { colId: "x", field: "x", editable: true, filterable: true, width: 80, headerName: "Sum", pinned: "start" } as const;
    const schema = build([[y(2024)]], { measures: [{ ...amount, column }] });
    const id = col([y(2024)], "amount");
    expect(schema.columns[1]).toMatchObject({
      colId: id, field: id, editable: false, filterable: false, width: 80, headerName: "Sum", cellDataType: "number",
    });
  });

  it("applies labelColumn but keeps its colId and field", () => {
    const labelColumn = { colId: "x", field: "x", headerName: "Region", width: 260, filterable: true };
    const schema = build([[y(2024)]], { labelColumn });
    expect(schema.columns[0]).toEqual({
      colId: PIVOT_LABEL_COLUMN_ID, field: PIVOT_LABEL_COLUMN_ID, headerName: "Region", width: 260, cellDataType: "text",
      filterable: false,
    });
  });
});

describe("buildPivotSchema — header text", () => {
  const headers = (step: GroupPathStep, options: Partial<PivotSchemaOptions> = {}) =>
    shape(build([[step]], options).columnGroups).map((child) => (Array.isArray(child) ? child[1] : child));

  it.each<[GroupPathStep, string]>([
    [["k", "z", null], "(Blanks)"],
    [["k", "s", "North"], "North"],
    [["k", "n", 2.5], "2.5"],
    [["k", "n", "Infinity"], "Infinity"],
    [["k", "b", false], "false"],
    [["k", "d", Date.UTC(2024, 1, 29, 23, 59)], "2024-02-29"],
  ])("formats %j as %s by default", (step, text) => {
    expect(headers(step)).toEqual([PIVOT_LABEL_COLUMN_ID, text]);
  });

  it("uses a custom formatKey for every group header", () => {
    const formatKey = ([dimension, , key]: GroupPathStep) => `${dimension}=${String(key)}`;
    const schema = build([[y(2024), q("Q1")]], { formatKey, rowTotals: true });
    expect(shape(schema.columnGroups)[1]).toEqual([
      grp([y(2024)]), "year=2024", [[grp([y(2024), q("Q1")]), "quarter=Q1", expect.any(Array)]],
    ]);
    expect(shape(schema.columnGroups).at(-1)).toEqual([grp([]), "Total", expect.any(Array)]);
  });
});

describe("buildPivotSchema — rejections", () => {
  it("rejects a tuple of another length", () => {
    expect(() => buildPivotSchema([[y(2024), q("Q1")], [y(2025)]], { measures })).toThrow(
      new RangeError("Invalid pivot keys: tuple 1 has 1 steps, expected 2"),
    );
  });

  it("rejects a step whose dimension differs from the first tuple's", () => {
    expect(() => buildPivotSchema([[y(2024), q("Q1")], [y(2025), ["month", "s", "Jan"]]], { measures })).toThrow(
      new RangeError('Invalid pivot keys: tuple 1 level 1 is "month", expected "quarter"'),
    );
  });

  it("rejects keys not grouped by prefix", () => {
    const keys = [[y(2024), q("Q1")], [y(2025), q("Q1")], [y(2024), q("Q2")]];
    expect(() => buildPivotSchema(keys, { measures })).toThrow(
      new RangeError("Invalid pivot keys: tuple 2 repeats an earlier prefix"),
    );
  });

  it("rejects a leaf tuple equal to an earlier one, adjacent or not", () => {
    const error = (index: number) => new RangeError(`Invalid pivot keys: tuple ${index} repeats an earlier prefix`);
    expect(() => buildPivotSchema([[y(2024)], [y(2024)]], { measures })).toThrow(error(1));
    expect(() => buildPivotSchema([[y(2024)], [y(2025)], [y(2024)]], { measures })).toThrow(error(2));
  });

  it("rejects an empty tuple, which would collide with the row totals", () => {
    expect(() => buildPivotSchema([[]], { measures })).toThrow(RangeError);
  });
});
