import { describe, expect, it } from "vitest";
import { createRowGrouping } from "../src/row-grouping/create-row-grouping";
import { TAG_STRING, TOTAL_ROW_ID, encodeGroupId } from "../src/row-grouping/keys";
import {
  isHierarchicalRowAccess,
  type CellValue,
  type HierarchicalRowAccess,
  type RowGroupingConfig,
} from "../src/types";
import type { FlatRowSource } from "../src/types/row-grouping-engine";
import { columnarSource, objectSource, toColumns } from "./row-grouping-source";

type Row = Record<string, CellValue | undefined>;

const rowsFixture = (): Row[] => [
  { id: "r0", country: "IT", city: "Rome", amount: 5 },
  { id: "r1", country: "FR", city: "Paris", amount: 1 },
  { id: "r2", country: "IT", city: "Milan", amount: 20 },
  { id: "r3", country: null, city: "Nowhere", amount: 2 },
  { id: "r4", country: "IT", city: "Rome", amount: 7 },
  { id: "r5", country: "FR", city: "Lyon", amount: 3 },
  { id: "r6", city: "Nowhere", amount: 4 },
];

const CONFIG: RowGroupingConfig = {
  dimensions: [{ field: "country" }, { field: "city" }],
  measures: [{ field: "amount", aggregate: "sum" }],
  defaultExpandedDepth: 1,
  grandTotal: "bottom",
};

const countryId = (country: string) => encodeGroupId([["country", TAG_STRING, country]]);
const cityId = (country: string, city: string) =>
  encodeGroupId([
    ["country", TAG_STRING, country],
    ["city", TAG_STRING, city],
  ]);

const buildAccess = (source: FlatRowSource, config: RowGroupingConfig = CONFIG) =>
  createRowGrouping(config).build(source) as HierarchicalRowAccess<Row>;

const setup = (config: RowGroupingConfig = CONFIG) => {
  const rows = rowsFixture();
  const grouping = createRowGrouping(config);
  const access = grouping.build(objectSource(rows, { idField: "id" })) as HierarchicalRowAccess<Row>;
  return { rows, grouping, access };
};

const ids = (access: HierarchicalRowAccess) => Array.from({ length: access.rowCount }, (_, view) => access.getRowId(view));

describe("grouped row access", () => {
  it("answers the D1 contract over a small tree", () => {
    const { rows, access } = setup();
    expect(isHierarchicalRowAccess(access)).toBe(true);
    // FR, Lyon, Paris, IT, Milan, Rome, null, Nowhere, total.
    expect(access.rowCount).toBe(9);
    expect(access.getRow(0)).toEqual({
      kind: "group",
      id: countryId("FR"),
      depth: 0,
      expanded: true,
      childCount: 2,
      leafCount: 2,
      field: "country",
      value: "FR",
    });
    expect(access.getRow(8)).toEqual({ kind: "total", id: TOTAL_ROW_ID, depth: 0, leafCount: 7 });
    expect([access.getValue(0, "amount"), access.getValue(3, "amount"), access.getValue(8, "amount")]).toEqual([4, 32, 42]);
    expect(access.getValue(0, "city")).toBeNull();
    expect(new Set(ids(access)).size).toBe(9);

    expect(access.setExpanded!([cityId("IT", "Rome")], true)).toBe(true);
    expect(access.rowCount).toBe(11);
    expect(access.getRow(6)).toEqual({ kind: "record", id: "r0", depth: 2 });
    expect([access.getRowId(7), access.getValue(7, "amount"), access.getValue(7, "city")]).toEqual(["r4", 7, "Rome"]);
    expect(access.getRecord!(6)).toBe(rows[0]);
    expect(access.getRecord!(5)).toBeUndefined();
    expect(access.setExpanded!([cityId("IT", "Rome")], true)).toBe(false);
    expect(access.setExpanded!(["r0", countryId("DE"), TOTAL_ROW_ID], true)).toBe(false);
    expect(access.setExpanded!(null, false)).toBe(true);
    expect(ids(access)).toEqual([countryId("FR"), countryId("IT"), expect.stringContaining('"z",null'), TOTAL_ROW_ID]);
  });

  it("locates a visible row, a hidden leaf, a hidden group and a removed id", () => {
    const { access } = setup();
    expect(access.locate(countryId("IT"))).toBe(3);
    expect(access.locate(cityId("IT", "Rome"))).toBe(5);
    expect(access.locate(TOTAL_ROW_ID)).toBe(8);
    expect(access.locate("r4")).toBe(5);
    access.setExpanded!([countryId("IT")], false);
    expect(access.locate(cityId("IT", "Rome"))).toBe(3);
    expect(access.locate("r4")).toBe(3);
    access.setExpanded!([cityId("IT", "Rome")], true);
    expect(access.locate("r4")).toBe(3);
    access.setExpanded!([countryId("IT")], true);
    expect(access.locate("r4")).toBe(7);
    expect(access.locate("r9")).toBe(-1);
    expect(access.locate(countryId("DE"))).toBe(-1);
    expect(access.locate(encodeGroupId([["city", TAG_STRING, "IT"]]))).toBe(-1);
  });

  it("locates records by flat position when the source has no identity", () => {
    const columns = toColumns(rowsFixture(), ["country", "city", "amount"]);
    const access = buildAccess(columnarSource(columns), { ...CONFIG, defaultExpandedDepth: 2 });
    for (let view = 0; view < access.rowCount; view++) {
      if (access.getRow(view)?.kind === "record") expect(access.locate(access.getRowId(view))).toBe(view);
    }
    expect(access.getRecord!(2)).toBeUndefined();
  });

  it("locates a record id it just read without scanning, and scans for any other", () => {
    const rows = rowsFixture();
    const source = objectSource(rows, { idField: "id" });
    let reads = 0;
    const getRowId = source.getRowId;
    const access = buildAccess(
      {
        ...source,
        getRowId: (row) => {
          reads += 1;
          return getRowId(row);
        },
      },
      { ...CONFIG, defaultExpandedDepth: 2 },
    );
    const counted = (id: string) => {
      reads = 0;
      return [access.locate(id), reads];
    };
    const r6 = access.locate("r6");
    expect(access.getRowId(r6)).toBe("r6");
    expect(counted("r6")).toEqual([r6, 1]);
    expect(counted("r5")[1]).toBe(6);
    rows[6]!.id = "r6b";
    expect(counted("r6")[0]).toBe(-1);
    expect(counted("r6b")[0]).toBe(r6);
  });

  it("round trips getState through initialState", () => {
    const { grouping, access } = setup();
    access.setExpanded!([cityId("IT", "Rome"), countryId("FR")], true);
    access.setExpanded!([countryId("FR"), countryId("IT")], false);
    access.setExpanded!([countryId("FR")], true);
    const state = grouping.getState();
    expect(state).toEqual({ expanded: [cityId("IT", "Rome")], collapsed: [countryId("IT")] });
    const restored = buildAccess(objectSource(rowsFixture(), { idField: "id" }), { ...CONFIG, initialState: state });
    expect(ids(restored)).toEqual(ids(access));
    access.setExpanded!([countryId("IT")], true);
    expect(ids(restored)).not.toEqual(ids(access));
  });

  it("expand-all moves the depth instead of listing every group, and round trips", () => {
    const { grouping, access } = setup();
    access.setExpanded!([countryId("FR")], true);
    expect(access.setExpanded!(null, true)).toBe(true);
    expect(grouping.getState()).toEqual({ expanded: [], collapsed: [], expandedDepth: 2 });
    access.setExpanded!([countryId("FR")], false);
    expect(grouping.getState()).toEqual({ expanded: [], collapsed: [countryId("FR")], expandedDepth: 2 });
    const restored = buildAccess(objectSource(rowsFixture(), { idField: "id" }), { ...CONFIG, initialState: grouping.getState() });
    expect(ids(restored)).toEqual(ids(access));
    expect(access.setExpanded!(null, false)).toBe(true);
    expect(grouping.getState()).toEqual({ expanded: [], collapsed: [], expandedDepth: 0 });
  });

  it("refolds a measure edit and regroups a dimension edit, keeping expansion and opening the new group", () => {
    const { rows, grouping, access } = setup();
    access.setExpanded!([cityId("IT", "Rome")], true);
    rows[4]!.amount = 1;
    expect(access.recordsChanged!([{ viewRow: 7, field: "amount" }])).toBe(false);
    expect([access.getValue(5, "amount"), access.getValue(3, "amount"), access.getValue(10, "amount")]).toEqual([6, 26, 36]);
    rows[4]!.city = "Milan";
    expect(access.recordsChanged!([{ viewRow: 7, field: "city" }])).toBe(true);
    // r4 moved into the collapsed Milan group, which opens: IT, Milan, r2, r4, Rome.
    expect(access.locate("r4")).toBe(6);
    expect(access.getRow(7)).toMatchObject({ id: cityId("IT", "Rome"), expanded: true, leafCount: 1 });
    expect(access.getValue(4, "amount")).toBe(21);
    expect(grouping.getState().expanded).toEqual([cityId("IT", "Rome"), cityId("IT", "Milan")]);
  });

  it("orders groups by a sorted measure", () => {
    const source = objectSource(rowsFixture(), { idField: "id", sort: [{ colId: "amount", direction: "desc" }] });
    const access = buildAccess(source, { ...CONFIG, defaultExpandedDepth: 0 });
    expect(ids(access).slice(0, 3)).toEqual([countryId("IT"), expect.stringContaining('"z",null'), countryId("FR")]);
  });

  it("rejects an object key and validates the configuration", () => {
    const source = objectSource([{ k: { a: 1 } }]);
    expect(createRowGrouping({ dimensions: [{ field: "k" }] }).build(source)).toEqual({ reason: "object-key", field: "k" });
    const invalid = (config: Partial<RowGroupingConfig>, message: string) =>
      expect(() => createRowGrouping({ ...CONFIG, ...config })).toThrow(new RangeError(message));
    invalid({ dimensions: [] }, "Invalid rowGrouping.dimensions: []");
    invalid({ dimensions: [{ field: "a" }, { field: "b", id: "a" }] }, "Invalid rowGrouping.dimensions.id: a");
    invalid(
      { measures: [{ field: "x", aggregate: "sum" }, { field: "x", source: "y", aggregate: "max" }] },
      "Invalid rowGrouping.measures.field: x",
    );
    invalid({ measures: [{ field: "x", aggregate: "median" as "sum" }] }, "Invalid rowGrouping.measures.aggregate: median");
    invalid({ defaultExpandedDepth: -1 }, "Invalid rowGrouping.defaultExpandedDepth: -1");
  });
});
