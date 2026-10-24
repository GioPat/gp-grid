// benchmarks/conformance/row-groups.spec.ts
// AC-008-01/02/05/07/08: group rows rendered from the engine and from an
// external hierarchy, their keys, labels, attributes and renderer params.
// Runs in the react, vue and angular projects.

import { expect, test } from "@playwright/test";
import { cell, columnIds, TOLERANCE } from "./helpers";
import { activeCell } from "./frozen-rows-helpers";
import { contentSize, sizerHeight } from "./row-heights-helpers";
import {
  AMOUNT,
  armRowGroups,
  COUNTRY,
  countryOf,
  domRows,
  expander,
  EXTERNAL_AMOUNT,
  EXTERNAL_GROUP_IDS,
  EXTERNAL_TOTAL_ID,
  externalFixtureSource,
  groupIndex,
  groupLabel,
  indexOfId,
  lastGroupingRejection,
  NAME,
  queryCount,
  records,
  ROW_COUNT,
  ROW_HEIGHT,
  rootRole,
  rowGroupEvents,
  SCORE,
  setExpanded,
  sumOf,
  TOTAL_ID,
  viewRows,
  waitForExpanded,
  type ViewRowSnapshot,
} from "./row-groups-helpers";

/** Total, four countries, three cities each, and every leaf. */
const FULLY_EXPANDED_COUNT = 1 + 4 + 12 + ROW_COUNT;

const aggregatesOf = (rows: readonly ViewRowSnapshot[]) =>
  rows.filter((row) => row.kind !== "record").map((row) => ({ id: row.id, values: row.values }));

test("AC-008-01 expands and collapses a country with no query", async ({ page }, testInfo) => {
  const pageErrors = await armRowGroups(page, testInfo.project.name, "object");
  const initial = await viewRows(page);
  expect(initial.map((row) => row.kind)).toEqual(["total", "group", "group", "group", "group"]);
  expect(initial[0]!.id).toBe(TOTAL_ID);
  expect(initial.slice(1).map((row) => [row.value, row.depth, row.expanded]))
    .toEqual([["", 0, false], ["FR", 0, false], ["IT", 0, false], [null, 0, false]]);

  // The aggregates match the leaves the source holds (AC-008-03 in the browser).
  const leaves = await records(page);
  const it = groupIndex(initial, "IT");
  expect(initial[0]!.values.amount).toBe(sumOf(leaves.map((record) => record.amount)));
  expect(initial[it]!.values.amount)
    .toBe(sumOf(leaves.filter((record) => countryOf(record) === "IT").map((record) => record.amount)));

  const queries = await queryCount(page);
  const extent = (await contentSize(page))!.height;
  const sizer = await sizerHeight(page);

  await expander(page, it).click();
  await expect.poll(async () => (await viewRows(page)).length).toBe(initial.length + 3);
  const expanded = await viewRows(page);
  expect(expanded.slice(it + 1, it + 4).map((row) => [row.kind, row.depth, row.value]))
    .toEqual([["group", 1, "City 0"], ["group", 1, "City 1"], ["group", 1, "City 2"]]);
  expect((await contentSize(page))!.height - extent).toBe(3 * ROW_HEIGHT);
  await expect.poll(async () => Math.abs((await sizerHeight(page)) - sizer - 3 * ROW_HEIGHT))
    .toBeLessThanOrEqual(TOLERANCE);
  expect(aggregatesOf(expanded).filter((row) => indexOfId(initial, row.id) >= 0))
    .toEqual(aggregatesOf(initial));

  await expander(page, it).click();
  await expect.poll(async () => (await viewRows(page)).length).toBe(initial.length);
  expect(await viewRows(page)).toEqual(initial);
  expect((await contentSize(page))!.height).toBe(extent);
  await expect.poll(async () => Math.abs((await sizerHeight(page)) - sizer)).toBeLessThanOrEqual(TOLERANCE);
  expect(await queryCount(page)).toBe(queries);
  expect((await rowGroupEvents(page)).groupToggled).toBe(2);
  // A pointer down on the expander selects nothing.
  expect(await activeCell(page)).toBeNull();
  expect(pageErrors).toEqual([]);
});

test("ungroup returns to the flat rows with no query", async ({ page }, testInfo) => {
  const pageErrors = await armRowGroups(page, testInfo.project.name, "object");
  const queries = await queryCount(page);

  await page.getByTestId("ungroup").click();

  await expect.poll(() => rootRole(page)).toBe("grid");
  const rows = await viewRows(page);
  expect(rows).toHaveLength(ROW_COUNT);
  expect(rows.every((row) => row.kind === "record" && row.depth === 0)).toBe(true);
  await expect(cell(page, 0, COUNTRY)).toHaveText("IT");
  await expect(page.locator(".gp-grid-row[data-row-kind]")).toHaveCount(0);
  expect(await queryCount(page)).toBe(queries);
  expect(pageErrors).toEqual([]);
});

test("AC-008-02 keys the null bucket apart from the empty string", async ({ page }, testInfo) => {
  const pageErrors = await armRowGroups(page, testInfo.project.name, "object");
  const rows = await viewRows(page);
  const blank = groupIndex(rows, null);
  const empty = groupIndex(rows, "");

  // `null` and the missing property share one bucket; `""` keeps its own.
  expect(rows[blank]!.leafCount).toBe(400);
  expect(rows[empty]!.leafCount).toBe(200);
  expect(rows[blank]!.id).not.toBe(rows[empty]!.id);
  await expect(groupLabel(page, blank)).toHaveText("(Blanks) (400)");
  await expect(groupLabel(page, empty)).toHaveText(/^\s*\(200\)$/);
  await expect(groupLabel(page, 0)).toHaveText("Grand total");
  expect(pageErrors).toEqual([]);
});

test("AC-008-02 object and columnar rows list the same view rows", async ({ page }, testInfo) => {
  const pageErrors = await armRowGroups(page, testInfo.project.name, "object");
  await page.getByTestId("expand-all").click();
  await expect.poll(async () => (await viewRows(page)).length).toBe(FULLY_EXPANDED_COUNT);
  const objectRows = await viewRows(page);

  await page.getByTestId("use-row-groups-columnar").click();
  await expect.poll(async () => (await viewRows(page)).length).toBe(5);
  await page.getByTestId("expand-all").click();
  await expect.poll(async () => (await viewRows(page)).length).toBe(FULLY_EXPANDED_COUNT);

  expect(await viewRows(page)).toEqual(objectRows);
  expect(pageErrors).toEqual([]);
});

test("AC-008-02 a formatter change relabels and keeps the expanded groups", async ({ page }, testInfo) => {
  const pageErrors = await armRowGroups(page, testInfo.project.name, "object");
  const initial = await viewRows(page);
  const itId = initial[groupIndex(initial, "IT")]!.id;
  expect(await setExpanded(page, [itId], true)).toBe("applied");
  const it = await waitForExpanded(page, itId, true);
  const expanded = await viewRows(page);

  await page.getByTestId("format-country").click();

  await expect(groupLabel(page, it)).toHaveText("Country IT (200)");
  await expect(groupLabel(page, groupIndex(expanded, null))).toHaveText("(Blanks) (400)");
  expect(await viewRows(page)).toEqual(expanded);
  expect(pageErrors).toEqual([]);
});

test("AC-008-05 rows carry the level, expansion and kind the view rows report", async ({ page }, testInfo) => {
  const pageErrors = await armRowGroups(page, testInfo.project.name, "object");
  const initial = await viewRows(page);
  const itId = initial[groupIndex(initial, "IT")]!.id;
  await setExpanded(page, [itId], true);
  const cityId = (await viewRows(page)).find((row) => row.depth === 1 && row.value === "City 0")!.id;
  await setExpanded(page, [cityId], true);
  const leaf = await waitForExpanded(page, cityId, true) + 1;

  expect(await rootRole(page)).toBe("treegrid");
  const rows = await viewRows(page);
  const mounted = await domRows(page);
  expect(mounted.length).toBeGreaterThan(5);
  for (const dom of mounted) {
    const row = rows[dom.index]!;
    expect(dom.kind, `row ${dom.index}`).toBe(row.kind);
    expect(dom.level, `row ${dom.index}`).toBe(String(row.depth + 1));
    expect(dom.expanded, `row ${dom.index}`).toBe(row.kind === "group" ? String(row.expanded) : null);
    expect(dom.className.includes(`gp-grid-row--${row.kind}`)).toBe(row.kind !== "record");
  }

  // Label cell, aggregate cells and renderer params per row kind (D10).
  await expect(cell(page, 1, COUNTRY)).toHaveClass(/gp-grid-cell--group-label/);
  await expect(cell(page, leaf, COUNTRY)).not.toHaveClass(/gp-grid-cell--group-label/);
  await expect(cell(page, 1, AMOUNT)).toHaveAttribute("aria-readonly", "true");
  await expect(cell(page, leaf, AMOUNT)).not.toHaveAttribute("aria-readonly", "true");
  await expect(cell(page, 0, SCORE).locator(".rg-kind-probe")).toHaveAttribute("data-probe-kind", "total");
  await expect(cell(page, 1, SCORE).locator(".rg-kind-probe")).toHaveAttribute("data-probe-kind", "group");
  await expect(cell(page, leaf, SCORE).locator(".rg-kind-probe")).toHaveAttribute("data-probe-kind", "record");
  // A cell without an aggregate renders empty and skips its renderer.
  for (const row of [0, 1]) {
    await expect(cell(page, row, NAME)).toHaveText("");
    await expect(cell(page, row, NAME).locator(".rg-kind-probe")).toHaveCount(0);
    await expect(cell(page, row, NAME)).toHaveAttribute("aria-readonly", "true");
  }
  await expect(cell(page, leaf, NAME).locator(".rg-kind-probe")).toHaveAttribute("data-probe-kind", "record");
  expect(pageErrors).toEqual([]);
});

test("AC-008-07 a paged source renders flat rows and reports partial-source", async ({ page }, testInfo) => {
  const pageErrors = await armRowGroups(page, testInfo.project.name, "paged");

  expect(await lastGroupingRejection(page)).toEqual({ reason: "partial-source" });
  expect(await rootRole(page)).toBe("grid");
  await expect(cell(page, 0, COUNTRY)).toHaveText("IT");
  await expect(cell(page, 1, COUNTRY)).toHaveText("FR");
  await expect(page.locator(".gp-grid-row[data-row-kind]")).toHaveCount(0);
  await expect(page.locator(".gp-grid-group-toggle")).toHaveCount(0);
  await expect(cell(page, 0, SCORE).locator(".rg-kind-probe")).toHaveAttribute("data-probe-kind", "flat");
  expect((await viewRows(page))[0]).toMatchObject({ kind: "record", id: 0, depth: 0 });
  expect(pageErrors).toEqual([]);
});

test("AC-008-08 an external hierarchy toggles equal labels apart", async ({ page }, testInfo) => {
  const pageErrors = await armRowGroups(page, testInfo.project.name, "external");
  const [groupA, groupB] = EXTERNAL_GROUP_IDS;
  expect((await viewRows(page)).map((row) => row.id)).toEqual([EXTERNAL_TOTAL_ID, groupA, groupB]);
  await expect(groupLabel(page, 1)).toHaveText("North (3)");
  await expect(groupLabel(page, 2)).toHaveText("North (3)");
  await expect(groupLabel(page, 0).locator(".rg-custom-label")).toHaveAttribute("data-row-kind", "total");

  // The renderer's `toggle` is a gesture, like the expander.
  await groupLabel(page, 1).locator(".rg-custom-toggle").click();
  await waitForExpanded(page, groupA, true);
  expect((await viewRows(page))[indexOfId(await viewRows(page), groupB)]!.expanded).toBe(false);
  await expander(page, indexOfId(await viewRows(page), groupB)).click();
  await waitForExpanded(page, groupB, true);
  await waitForExpanded(page, groupA, true);
  expect((await rowGroupEvents(page)).groupToggled).toBe(2);

  const rows = await viewRows(page);
  expect(rows.map((row) => row.values.amount)).toEqual([210, 60, 10, 20, 30, 150, 40, 50, 60]);
  expect(await queryCount(page)).toBe(1);
  expect(pageErrors).toEqual([]);
});

test("AC-008-08 an external hierarchy settles a new revision and new columns", async ({ page }, testInfo) => {
  const pageErrors = await armRowGroups(page, testInfo.project.name, "external");
  const [groupA, groupB] = EXTERNAL_GROUP_IDS;
  await setExpanded(page, null, true);
  await waitForExpanded(page, groupB, true);
  const survivor = `${groupB}:1`;
  const before = indexOfId(await viewRows(page), survivor);
  await cell(page, before, EXTERNAL_AMOUNT).click();
  expect(await activeCell(page)).toEqual({ row: before, col: EXTERNAL_AMOUNT });

  await page.getByTestId("replace-revision").click();

  await expect.poll(async () => (await viewRows(page)).map((row) => row.id))
    .toEqual([EXTERNAL_TOTAL_ID, groupB, `${groupB}:0`, survivor, `${groupB}:2`]);
  const rows = await viewRows(page);
  expect(rows.map((row) => row.values.amount)).toEqual([300, 300, 80, 100, 120]);
  expect(indexOfId(rows, groupA)).toBe(-1);
  expect(await activeCell(page)).toEqual({ row: indexOfId(rows, survivor), col: EXTERNAL_AMOUNT });
  await expect(cell(page, indexOfId(rows, survivor), EXTERNAL_AMOUNT)).toHaveText("100");

  await page.getByTestId("replace-columns").click();

  await expect.poll(() => columnIds(page)).toEqual(["region", "amount", "code"]);
  await expect(cell(page, indexOfId(rows, survivor), 2)).toHaveText("X-11");
  await expect(groupLabel(page, 1)).toHaveText("North (3)");
  expect(pageErrors).toEqual([]);
});

// eslint-disable-next-line no-empty-pattern
test("AC-008-08 the external fixture module imports types only", async ({}, testInfo) => {
  const source = externalFixtureSource(testInfo.project.name);
  const imports = source.split("\n").filter((line) => line.startsWith("import "));
  expect(imports.length).toBeGreaterThan(0);
  for (const line of imports) expect(line).toMatch(/^import type \{/);
  expect(source).not.toMatch(/row-grouping|createRowGrouping/);
});
