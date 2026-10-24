// PRD 012 D2: pivot column and header group ids over the group id path JSON.

import { describe, expect, it } from "vitest";
import {
  PIVOT_LABEL_COLUMN_ID,
  decodePivotColumnId,
  encodePivotColumnId,
  encodePivotGroupId,
} from "../src/hierarchy/pivot-ids";
import { encodeGroupId } from "../src/hierarchy/group-path";
import type { GroupPathStep } from "../src/types";

const year: GroupPathStep = ["year", "n", 2024];

describe("encodePivotColumnId and decodePivotColumnId", () => {
  it.each<[string, GroupPathStep]>([
    ["z", ["region", "z", null]],
    ["s", ["region", "s", "North"]],
    ["n", ["year", "n", 2024]],
    ["b", ["active", "b", true]],
    ["d", ["day", "d", Date.UTC(2024, 0, 31)]],
  ])("round-trips a tuple ending in a %s step", (_tag, step) => {
    const path = [year, step];
    const id = encodePivotColumnId(path, "amount");
    expect(decodePivotColumnId(id)).toEqual({ path, measure: "amount" });
  });

  it("writes the path as a group id does", () => {
    const json = encodeGroupId([year]).slice("gp-group:".length);
    expect(encodePivotColumnId([year], "amount")).toBe(`gp-pivot:${json}|amount`);
    expect(encodePivotGroupId([year])).toBe(`gp-pivot-group:${json}`);
  });

  it("round-trips a non-finite number as it is written in a group id", () => {
    const path: GroupPathStep[] = [["ratio", "n", Number.POSITIVE_INFINITY]];
    const id = encodePivotColumnId(path, "count");
    expect(id).toBe('gp-pivot:[["ratio","n","Infinity"]]|count');
    expect(decodePivotColumnId(id)).toEqual({ path, measure: "count" });
  });

  it("round-trips the row total of a measure", () => {
    expect(encodePivotColumnId([], "amount")).toBe("gp-pivot:[]|amount");
    expect(decodePivotColumnId("gp-pivot:[]|amount")).toEqual({ path: [], measure: "amount" });
  });

  it("keeps a | in a key or in the measure", () => {
    const path: GroupPathStep[] = [["code", "s", "a|b]"], ["kind", "s", "|"]];
    const id = encodePivotColumnId(path, "sum|net|");
    expect(decodePivotColumnId(id)).toEqual({ path, measure: "sum|net|" });
    expect(decodePivotColumnId(encodePivotColumnId([], "|"))).toEqual({ path: [], measure: "|" });
  });

  it("decodes nothing else", () => {
    expect(decodePivotColumnId(encodeGroupId([year]))).toBeUndefined();
    expect(decodePivotColumnId(encodePivotGroupId([year]))).toBeUndefined();
    expect(decodePivotColumnId(PIVOT_LABEL_COLUMN_ID)).toBeUndefined();
    expect(decodePivotColumnId("amount")).toBeUndefined();
    expect(decodePivotColumnId("gp-pivot:[]")).toBeUndefined();
    expect(decodePivotColumnId('gp-pivot:[["year","x",1]]|amount')).toBeUndefined();
  });
});

describe("encodePivotGroupId", () => {
  it("is the prefix JSON, with [] for the row totals group", () => {
    expect(encodePivotGroupId([])).toBe("gp-pivot-group:[]");
    expect(encodePivotGroupId([year, ["quarter", "s", "Q1"]])).toBe(
      'gp-pivot-group:[["year","n",2024],["quarter","s","Q1"]]',
    );
  });

  it("is the label column id's constant", () => {
    expect(PIVOT_LABEL_COLUMN_ID).toBe("gp-pivot-label");
  });
});
