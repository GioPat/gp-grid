// PRD 009 (AC-009-03, AC-009-06): late responses, protocol errors and failures against the mock service.

import { describe, expect, it } from "vitest";
import { decodeGroupId } from "../src/hierarchy/group-path";
import {
  createServerGroupingSource,
  type ServerGroupingConfig,
  type ServerGroupingSource,
} from "../src/server-grouping";
import type { HierarchicalRowAccess, HierarchyChange } from "../src/types";
import { createMockGroupingService, type MockCorruption } from "./server-grouping-mock";
import { GROUPING, makeSales, naiveAggregates, type Sale } from "./server-grouping-oracle";

type View = HierarchicalRowAccess<Sale>;

const sales = makeSales(11, 240);
const ALL = { startRow: 0, endRow: Number.MAX_SAFE_INTEGER };
const WINDOW = [{ start: 0, end: 40 }];

const MESSAGES: Record<MockCorruption, RegExp> = {
  "stale-revision": /^Stale revision 0, expected 1$/,
  "wrong-count": /^totalCount \d+ differs from the declared \d+$/,
  "long-page": /^Page too long/,
  "short-page": /^Page too short/,
  "object-key": /^Invalid group key at child 0$/,
};

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** A view whose changes are recorded, applying each `"view"` change as core does. */
const queryView = async (source: ServerGroupingSource<Sale>) => {
  const { access } = await source.query({ range: ALL });
  const view = access as View;
  const changes: HierarchyChange[] = [];
  view.subscribe!((change) => {
    changes.push(change);
    if (change.kind === "view") change.apply();
  });
  return { view, changes };
};

const open = async (config: Partial<ServerGroupingConfig<Sale>> = {}) => {
  const mock = createMockGroupingService(sales, { getRowId: (row) => row.id });
  const source = createServerGroupingSource<Sale>(mock, { ...GROUPING, getRowId: (row) => row.id, ...config });
  return { mock, source, ...(await queryView(source)) };
};

const expandAndLoad = async (view: View, id: string | number) => {
  expect(view.setExpanded!([id], true)).toBe(true);
  view.requestRows!(WINDOW);
  await flush();
};

describe("server grouping — late responses (AC-009-03)", () => {
  it("leaves a group collapsed when its held children arrive after the collapse", async () => {
    const { mock, view, changes } = await open();
    const first = view.getRowId(0);
    const rows = view.rowCount;
    mock.hold();
    view.setExpanded!([first], true);
    view.requestRows!(WINDOW);
    const held = mock.requests.at(-1)!;
    expect(held).toMatchObject({ kind: "children", request: { path: decodeGroupId(first) } });

    expect(view.setExpanded!([first], false)).toBe(true);
    expect(held.request.signal?.aborted).toBe(true);
    mock.release();
    await flush();
    expect(held.aborted).toBe(true);
    expect(changes).toEqual([]);
    expect(view.getRow(0)).toMatchObject({ kind: "group", id: first, expanded: false });
    expect(view.rowCount).toBe(rows);
  });

  it("drops the first view's held pages when a second query replaces it", async () => {
    const { mock, source, view, changes } = await open();
    const first = view.getRowId(0);
    view.setExpanded!([first], true);
    mock.hold();
    view.requestRows!(WINDOW);
    const held = mock.requests.at(-1)!;
    const next = source.query({ range: ALL });
    expect(held.request.signal?.aborted).toBe(true);

    mock.release();
    const replaced = (await next).access as View;
    await flush();
    expect(held.aborted).toBe(true);
    expect(changes).toEqual([]);
    expect(view.getRow(1)).toBeUndefined();
    expect(replaced.getRow(0)).toMatchObject({ id: first, expanded: true });
    expect(replaced.getRow(1)).toBeUndefined();
  });

  it("destroy() releases the current view: its requests abort and nothing more is notified", async () => {
    const { mock, source, view, changes } = await open();
    view.setExpanded!([view.getRowId(0)], true);
    mock.hold();
    view.requestRows!(WINDOW);
    const held = mock.requests.at(-1)!;
    source.destroy();
    mock.release();
    await flush();
    expect(held.aborted).toBe(true);
    expect(changes).toEqual([]);
    view.requestRows!(WINDOW);
    expect(mock.requests.at(-1)).toBe(held);
  });
});

describe("server grouping — protocol errors and failures (AC-009-06)", () => {
  it.each(Object.keys(MESSAGES) as MockCorruption[])(
    "collapses the one branch whose children page has a %s",
    async (how) => {
      const { mock, source, view, changes } = await open();
      const [first, second] = [view.getRowId(0), view.getRowId(1)];
      await expandAndLoad(view, second);
      mock.corruptNext("children", how);
      await expandAndLoad(view, first);

      expect(view.getRow(0)).toMatchObject({ kind: "group", id: first, expanded: false });
      expect(view.getRow(0)).toHaveProperty("error", expect.stringMatching(MESSAGES[how]));
      const sibling = view.locate(second);
      expect(view.getRow(sibling)).toMatchObject({ id: second, expanded: true });
      expect(view.getRow(sibling + 1)).toMatchObject({ kind: "group", depth: 1 });
      expect(source.getState()).toEqual({ expanded: [second], collapsed: [] });
      expect(changes.filter((change) => change.kind === "view")).toHaveLength(1);
    },
  );

  it.each(["stale-revision", "wrong-count", "long-page", "short-page"] as const)(
    "collapses the one terminal group whose leaf page has a %s",
    async (how) => {
      const { mock, source, view } = await open();
      const first = view.getRowId(0);
      await expandAndLoad(view, first);
      const [team, sibling] = [view.getRowId(1), view.getRowId(2)];
      await expandAndLoad(view, sibling);
      mock.corruptNext("leaves", how);
      await expandAndLoad(view, team);

      expect(view.getRow(1)).toMatchObject({ id: team, expanded: false });
      expect(view.getRow(1)).toHaveProperty("error", expect.stringMatching(MESSAGES[how]));
      expect(view.getRow(3)).toMatchObject({ kind: "record", depth: 2 });
      expect(source.getState()).toEqual({ expanded: [first, sibling], collapsed: [] });
    },
  );

  it("retries a failed branch when it is expanded again, clearing its error", async () => {
    const { mock, view } = await open();
    const first = view.getRowId(0);
    mock.failNext("children");
    await expandAndLoad(view, first);
    expect(view.getRow(0)).toMatchObject({ expanded: false, error: "mock failure" });

    const sent = mock.requests.length;
    await expandAndLoad(view, first);
    expect(view.getRow(0)).toMatchObject({ expanded: true });
    expect(view.getRow(0)).not.toHaveProperty("error");
    expect(mock.requests.slice(sent)).toMatchObject([{ kind: "children", request: { path: decodeGroupId(first) } }]);
    expect(view.getRow(1)).toMatchObject({ kind: "group", depth: 1 });
  });

  it("notifies a failed root page as an error and requests it no more in this view", async () => {
    const { mock, view, changes } = await open({ cache: { pageSize: 4, prefetchPages: 0 } });
    mock.failNext("children");
    view.requestRows!([{ start: 4, end: 8 }]);
    await flush();
    expect(changes).toEqual([{ kind: "error", message: "mock failure" }]);

    const sent = mock.requests.length;
    view.requestRows!([{ start: 4, end: 8 }]);
    expect(mock.requests).toHaveLength(sent);
    expect(view.getRow(4)).toBeUndefined();
  });

  it("rejects the query when its root request fails or contradicts itself", async () => {
    const mock = createMockGroupingService(sales, { getRowId: (row) => row.id });
    const source = createServerGroupingSource<Sale>(mock, { ...GROUPING, getRowId: (row) => row.id });
    mock.failNext("children");
    await expect(source.query({ range: ALL })).rejects.toThrow("mock failure");
    mock.corruptNext("children", "object-key");
    await expect(source.query({ range: ALL })).rejects.toThrow("Invalid group key at child 0");
    mock.corruptNext("children", "wrong-count");
    await expect(source.query({ range: ALL })).rejects.toThrow("Page too short: 11 children for 12");
    await expect(source.query({ range: ALL })).resolves.toMatchObject({ rows: [], totalRows: 11 });
  });

  it.each([
    [{ dimensions: [] }, "dimensions: []"],
    [{ dimensions: [{ field: "region" }, { field: "team", id: "region" }] }, "dimensions.id: region"],
    [{ measures: [{ field: "m", aggregate: "sum" }, { field: "m", aggregate: "max" }] }, "measures.field: m"],
    [{ defaultExpandedDepth: -1 }, "defaultExpandedDepth: -1"],
    [{ getRowId: undefined }, "getRowId: undefined"],
    [{ maxConcurrentRequests: 0 }, "maxConcurrentRequests: 0"],
  ])("rejects an unsupported configuration: %o", (override, message) => {
    const mock = createMockGroupingService(sales, { getRowId: (row) => row.id });
    const config = { ...GROUPING, getRowId: (row: Sale) => row.id, ...override } as ServerGroupingConfig<Sale>;
    expect(() => createServerGroupingSource(mock, config)).toThrow(new RangeError(`Invalid serverGrouping.${message}`));
  });
});

describe("server grouping — the view (D2)", () => {
  it("answers the total, group, leaf and pending rows, and locates each", async () => {
    const { view } = await open({ grandTotal: "top" });
    expect(view.getRow(0)).toEqual({ kind: "total", id: "gp-total", depth: 0, leafCount: 240 });
    expect(view.getValue(0, "amount")).toBe(naiveAggregates(sales).amount);
    const region = view.getRowId(1);
    expect(view.setExpanded!([region], true)).toBe(true);
    const pending = `gp-pending:0@${String(region)}`;
    expect([view.getRow(2), view.getRowId(2), view.getValue(2, "amount")]).toEqual([undefined, pending, null]);
    expect(view.locate(pending)).toBe(2);

    view.requestRows!(WINDOW);
    await flush();
    const team = view.getRowId(2);
    expect(view.getRow(2)).toMatchObject({ kind: "group", depth: 1, field: "team", expanded: false });
    await expandAndLoad(view, team);
    const leaf = view.getRecord!(3)!;
    expect(view.getRow(3)).toEqual({ kind: "record", id: leaf.id, depth: 2 });
    expect([view.getValue(3, "amount"), view.locate(leaf.id)]).toEqual([leaf.amount ?? null, 3]);

    expect(view.setExpanded!([region], false)).toBe(true);
    expect([view.locate(pending), view.locate(team), view.locate(leaf.id)]).toEqual([1, 1, -1]);
    expect([view.locate("gp-total"), view.locate("missing")]).toEqual([0, -1]);
  });

  it("expands every loaded group with null and collapses them all again", async () => {
    const { view, source } = await open();
    const children = Array.from({ length: 11 }, (_, row) => view.getRow(row)).reduce(
      (sum, row) => sum + (row?.kind === "group" ? row.childCount : 0),
      0,
    );
    expect(view.setExpanded!(null, true)).toBe(true);
    expect(view.rowCount).toBe(11 + children);
    view.requestRows!(WINDOW);
    await flush();
    expect(view.getRow(1)).toMatchObject({ kind: "group", depth: 1, expanded: true });
    expect(source.getState()).toEqual({ expanded: [], collapsed: [], expandedDepth: 2 });

    expect(view.setExpanded!(null, false)).toBe(true);
    expect(view.rowCount).toBe(11);
    expect(view.setExpanded!(null, false)).toBe(false);
  });
});
