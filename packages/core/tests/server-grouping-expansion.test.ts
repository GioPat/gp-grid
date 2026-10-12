// PRD 009 D2/D5: the edges of setExpanded, expand all, and the access over the mock service.

import { describe, expect, it, vi } from "vitest";
import { decodeGroupId, encodeGroupId } from "../src/hierarchy/group-path";
import { TOTAL_ROW_ID } from "../src/hierarchy/keys";
import { createServerGroupingSource, type ServerGroupingConfig } from "../src/server-grouping";
import type { HierarchicalRowAccess, HierarchyChange } from "../src/types";
import { createMockGroupingService } from "./server-grouping-mock";
import { GROUPING, makeSales, type Sale } from "./server-grouping-oracle";

type View = HierarchicalRowAccess<Sale>;

const sales = makeSales(17, 200);
const ALL = { startRow: 0, endRow: Number.MAX_SAFE_INTEGER };
const WINDOW = [{ start: 0, end: 60 }];
const ROOT_ID = encodeGroupId([]);

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const open = async (config: Partial<ServerGroupingConfig<Sale>> = {}) => {
  const mock = createMockGroupingService(sales, { getRowId: (row) => row.id });
  const source = createServerGroupingSource<Sale>(mock, { ...GROUPING, getRowId: (row) => row.id, ...config });
  const { access } = await source.query({ range: ALL });
  const view = access as View;
  view.subscribe!((change) => {
    if (change.kind === "view") change.apply();
  });
  return { mock, source, view };
};

const load = async (view: View) => {
  view.requestRows!(WINDOW);
  await flush();
};

/** Expands the first region and its first team, loading both pages; returns the three ids. */
const openLeaf = async (view: View) => {
  const region = view.getRowId(0);
  expect(view.setExpanded!([region], true)).toBe(true);
  await load(view);
  const team = view.getRowId(1);
  expect(view.getRow(1)).toMatchObject({ kind: "group", depth: 1 });
  expect(view.setExpanded!([team], true)).toBe(true);
  await load(view);
  expect(view.getRow(2)).toMatchObject({ kind: "record", depth: 2 });
  return { region, team, leaf: view.getRowId(2) };
};

describe("server grouping — setExpanded edges", () => {
  it("ignores an unknown id, the root path, a leaf id, and a repeated state", async () => {
    const { view } = await open();
    const rows = view.rowCount;
    expect(view.setExpanded!(["nope"], true)).toBe(false);
    expect(view.setExpanded!([ROOT_ID], true)).toBe(false);
    expect(view.setExpanded!([view.getRowId(0)], false)).toBe(false);
    expect(view.rowCount).toBe(rows);

    const { region, leaf } = await openLeaf(view);
    expect(view.setExpanded!([leaf], true)).toBe(false);
    expect(view.setExpanded!([region], true)).toBe(false);
  });

  it("cannot expand a group whose parent is collapsed or whose page is not loaded", async () => {
    const { view, mock } = await open();
    const { region, team } = await openLeaf(view);
    expect(view.setExpanded!([region], false)).toBe(true);
    expect(view.setExpanded!([team], true)).toBe(false);

    mock.hold();
    expect(view.setExpanded!([region], true)).toBe(true);
    view.requestRows!(WINDOW);
    expect(view.getRow(1)).toBeUndefined();
    expect(view.setExpanded!([team], true)).toBe(false);
    mock.release();
    await flush();
    expect(view.getRow(1)).toMatchObject({ kind: "group", id: team, expanded: true });
  });

  it("expands and collapses every loaded group at once, reaching groups loaded later", async () => {
    const { view, source } = await open();
    const rootRows = view.rowCount;
    expect(view.setExpanded!(null, true)).toBe(true);
    expect(source.getState().expandedDepth).toBe(2);
    expect(view.setExpanded!(null, true)).toBe(false);
    const withTeams = view.rowCount;
    expect(withTeams).toBeGreaterThan(rootRows);

    await load(view);
    expect(view.rowCount).toBeGreaterThan(withTeams);
    expect(view.setExpanded!(null, true)).toBe(false);

    expect(view.setExpanded!(null, false)).toBe(true);
    expect(view.rowCount).toBe(rootRows);
    expect(source.getState().expandedDepth).toBeUndefined();
    expect(view.setExpanded!(null, false)).toBe(false);
  });
});

describe("server grouping — access edges", () => {
  it("answers nothing outside the view and null for a field a row lacks", async () => {
    const { view } = await open();
    const { leaf } = await openLeaf(view);
    expect(view.getRow(-1)).toBeUndefined();
    expect(view.getRow(view.rowCount)).toBeUndefined();
    expect(view.getRowId(view.rowCount)).toBe(-1);
    expect(view.getRecord!(0)).toBeUndefined();
    expect(view.getRecord!(2)).toMatchObject({ id: leaf });
    expect(view.getValue(0, "nope")).toBeNull();
    expect(view.getValue(2, "nope")).toBeNull();
    expect(view.getValue(view.rowCount, "amount")).toBeNull();
  });

  it("serves the total row and the pending ids of the root", async () => {
    const { view } = await open({ grandTotal: "top" });
    expect(view.getRow(0)).toMatchObject({ kind: "total", id: TOTAL_ROW_ID, depth: 0 });
    expect(view.getRowId(0)).toBe(TOTAL_ROW_ID);
    expect(view.getValue(0, "amount")).toEqual(expect.any(Number));
    expect(view.getValue(0, "nope")).toBeNull();
    expect(view.locate(TOTAL_ROW_ID)).toBe(0);
    expect(view.locate(`gp-pending:0@${ROOT_ID}`)).toBe(1);
    expect(view.locate("gp-pending:0@not-a-group")).toBe(-1);
    expect(view.locate(encodeGroupId([["region", "s", "no such region"]]))).toBe(-1);
  });

  it("locates a pending row of a collapsed group at that group", async () => {
    const { view } = await open();
    const { region, team } = await openLeaf(view);
    const pending = `gp-pending:0@${team}`;
    expect(view.locate(pending)).toBe(2);
    expect(view.setExpanded!([team], false)).toBe(true);
    expect(view.locate(pending)).toBe(1);
    expect(decodeGroupId(team)?.length).toBe(2);
    expect(view.setExpanded!([region], false)).toBe(true);
    expect(view.locate(pending)).toBe(0);
  });

  it("keeps notifying the other listeners when one unsubscribes during a change", async () => {
    const { view } = await open();
    const seen: HierarchyChange["kind"][] = [];
    const unsubscribe = view.subscribe!(() => {
      seen.push("rows");
      unsubscribe();
    });
    const other = vi.fn();
    view.subscribe!(other);

    expect(view.setExpanded!([view.getRowId(0)], true)).toBe(true);
    await load(view);
    expect(seen).toEqual(["rows"]);
    expect(other).toHaveBeenCalledTimes(1);

    expect(view.setExpanded!([view.getRowId(1)], true)).toBe(true);
    await load(view);
    expect(seen).toEqual(["rows"]);
    expect(other).toHaveBeenCalledTimes(2);
  });
});
