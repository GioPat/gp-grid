// benchmarks/conformance/pivot.spec.ts
// AC-012-01/02/03/06/07: a precomputed pivot over the existing contracts, its
// childless terminal rows, its generated header, a revision replace, a late
// old revision, read-only cells and a thousand-key schema.
// Runs in the react, vue and angular projects.

import { expect, test } from "@playwright/test";
import { cell, columnIds, columnState, scrollBody } from "./helpers";
import { activateCell } from "./pinning-helpers";
import { activeCell } from "./frozen-rows-helpers";
import {
  columnGroups,
  escapeIdPart,
  expectGroupedHeader,
  fragmentsOf,
  groupSpans,
  headerBands,
  nextFrames,
  readHeader,
  type GroupChild,
} from "./column-groups-helpers";
import { container, expander, groupLabel, indexOfId, queryCount, rowAt, viewRows, waitForExpanded } from "./row-groups-helpers";
import {
  armPivot,
  BAND_HEIGHT,
  cellText,
  COLUMNS_1,
  COLUMNS_2,
  expectLiterals,
  LABEL,
  LABEL_ID,
  layoutIndexOf,
  PIVOT_COLUMN_IDS,
  PIVOT_COLUMNS_1,
  PIVOT_COLUMNS_2,
  PIVOT_GROUP_IDS,
  PIVOT_ROW_IDS,
  PIVOT_VALUES_1,
  PIVOT_VALUES_2,
  PIVOT_WIDE_KEY_COUNT,
  pivotFixtureSource,
  pivotRevision,
} from "./pivot-helpers";

const { total, north, oslo, bergen, south, rome } = PIVOT_ROW_IDS;
const ids = PIVOT_COLUMN_IDS;

const activeGroups = async (page: Parameters<typeof columnGroups>[0]): Promise<GroupChild[]> => {
  const groups = await columnGroups(page);
  expect(groups).not.toBeNull();
  return groups!;
};

test("AC-012-01 shows the literal values, row totals and grand total", async ({ page }, testInfo) => {
  const pageErrors = await armPivot(page, testInfo.project.name, "external");
  expect((await viewRows(page)).map((row) => row.id)).toEqual([total, north, south]);
  await expectLiterals(page, PIVOT_VALUES_1, [total, north, south], PIVOT_COLUMNS_1);
  await expect(groupLabel(page, 1, LABEL)).toHaveText("North (9)");
  await expect(cell(page, 0, 1)).toHaveText(cellText(PIVOT_VALUES_1[total]![ids.q2024q1Amount]));
  await expect(cell(page, 1, 3)).toHaveText(cellText(PIVOT_VALUES_1[north]![ids.q2024q2Amount]));

  await expander(page, 1, LABEL).click();
  await waitForExpanded(page, north, true);
  expect((await viewRows(page)).map((row) => row.id)).toEqual([total, north, oslo, bergen, south]);
  await expectLiterals(page, PIVOT_VALUES_1, [oslo, bergen], PIVOT_COLUMNS_1);
  await expect(groupLabel(page, 2, LABEL)).toHaveText("Oslo (5)");
  // An intersection without records renders empty.
  await expect(cell(page, 3, 3)).toHaveText("");

  await expander(page, 4, LABEL).click();
  await waitForExpanded(page, south, true);
  expect((await viewRows(page)).map((row) => row.id)).toEqual([total, north, oslo, bergen, south, rome]);
  await expectLiterals(page, PIVOT_VALUES_1, [south, rome], PIVOT_COLUMNS_1);
  expect(await queryCount(page)).toBe(1);
  expect(pageErrors).toEqual([]);
});

test("AC-012-01 a terminal row has no expander and ignores the keyboard toggle", async ({ page }, testInfo) => {
  const pageErrors = await armPivot(page, testInfo.project.name, "external");
  await container(page).focus();
  await activateCell(page, 1, LABEL);
  await expect.poll(() => activeCell(page)).toEqual({ row: 1, col: LABEL });
  await page.keyboard.press("Enter");
  await waitForExpanded(page, north, true);

  const city = indexOfId(await viewRows(page), oslo);
  await expect(cell(page, city, LABEL).locator(".gp-grid-group-toggle:not(.gp-grid-group-toggle--none)")).toHaveCount(0);
  await expect(cell(page, 1, LABEL).locator(".gp-grid-group-toggle--expanded")).toHaveCount(1);
  const row = await rowAt(page, city);
  await expect(row).toHaveAttribute("data-row-kind", "group");
  expect(await row.getAttribute("aria-expanded")).toBeNull();

  const before = await viewRows(page);
  await activateCell(page, city, LABEL);
  await expect.poll(() => activeCell(page)).toEqual({ row: city, col: LABEL });
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowRight");
  await nextFrames(page);
  expect(await viewRows(page)).toEqual(before);
  await expect(page.locator(".gp-grid-edit-input")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("AC-012-03 the header spans the label column over three bands, pinned and frozen", async ({ page }, testInfo) => {
  const pageErrors = await armPivot(page, testInfo.project.name, "external");
  expect(await columnIds(page)).toEqual(COLUMNS_1);
  const groups = await activeGroups(page);
  const sample = await expectGroupedHeader(page, groups, true);
  expect(sample.bands.heights).toEqual([BAND_HEIGHT, BAND_HEIGHT, BAND_HEIGHT]);
  const label = sample.view.cells.find((entry) => entry.kind === "leaf" && entry.layoutIndex === LABEL);
  expect(label).toMatchObject({ rowIndex: 1, rowSpan: 3, text: "Region / City" });
  expect(await groupSpans(page, PIVOT_GROUP_IDS.y2024)).toEqual([{ region: "center", colIndex: 2, colSpan: 4 }]);
  const texts = async () => Promise.all([0, 1].flatMap((row) => [0, 1, 2].map((col) => cell(page, row, col).textContent())));
  const unfrozen = await texts();

  await page.getByTestId("pivot-pin-label").click();
  await page.getByTestId("freeze-two").click();

  await expect.poll(async () => (await columnState(page)).find((entry) => entry.columnId === LABEL_ID)?.region).toBe("start");
  const pinned = await expectGroupedHeader(page, groups, true);
  const labelCell = pinned.view.cells.find((entry) => entry.kind === "leaf" && entry.layoutIndex === LABEL);
  expect(labelCell).toMatchObject({ region: "start", rowSpan: 3 });
  expect(fragmentsOf(pinned.view).filter((fragment) => fragment.region === "start")).toEqual([]);
  expect(await groupSpans(page, PIVOT_GROUP_IDS.y2024)).toEqual([{ region: "center", colIndex: 2, colSpan: 4 }]);
  await expect(page.locator('.gp-grid-frozen-rows [data-cell-row="1"]').first()).toBeVisible();
  expect(await texts()).toEqual(unfrozen);
  expect(pageErrors).toEqual([]);
});

test("AC-012-03 a generated leaf moved into another group keeps its id and values", async ({ page }, testInfo) => {
  const pageErrors = await armPivot(page, testInfo.project.name, "external");
  const groups = await activeGroups(page);

  await page.getByTestId("pivot-move-leaf").click();

  await expect.poll(async () => (await layoutIndexOf(page, ids.q2025q1Amount))).toBe(4);
  const order = await columnIds(page);
  expect(order.slice(3, 6)).toEqual([ids.q2024q2Amount, ids.q2025q1Amount, ids.q2024q2Count]);
  expect([...order].sort()).toEqual([...COLUMNS_1].sort());
  await expectLiterals(page, PIVOT_VALUES_1, [total, north, south], PIVOT_COLUMNS_1);
  await expect(cell(page, 0, 4)).toHaveText(cellText(PIVOT_VALUES_1[total]![ids.q2025q1Amount]));

  const fragments = new Set<string>();
  const collect = async () => {
    const sample = await expectGroupedHeader(page, groups, true);
    for (const fragment of fragmentsOf(sample.view, PIVOT_GROUP_IDS.y2025)) fragments.add(fragment.fragmentId!);
  };
  await collect();
  await scrollBody(page, 0, 600);
  await collect();
  expect([...fragments].sort()).toEqual([`${PIVOT_GROUP_IDS.y2025}:center:0`, `${PIVOT_GROUP_IDS.y2025}:center:1`]);
  expect(pageErrors).toEqual([]);
});

test("AC-012-02 a revision replace changes the bands and keeps surviving state", async ({ page }, testInfo) => {
  const pageErrors = await armPivot(page, testInfo.project.name, "external");
  await expander(page, 1, LABEL).click();
  await waitForExpanded(page, north, true);
  await page.getByTestId("pivot-set-total-width").click();
  const totalWidth = async () => (await columnState(page)).find((entry) => entry.columnId === ids.totalAmount)?.width;
  await expect.poll(totalWidth).toBe(200);
  expect((await headerBands(page))?.count).toBe(3);
  const queries = await queryCount(page);

  await page.getByTestId("pivot-replace-revision").click();

  await expect.poll(() => columnIds(page)).toEqual(COLUMNS_2);
  await expect.poll(async () => (await headerBands(page))?.count).toBe(2);
  await expectLiterals(page, PIVOT_VALUES_2, [total, north, oslo, bergen, south], PIVOT_COLUMNS_2);
  expect(await totalWidth()).toBe(200);
  expect(await pivotRevision(page)).toBe(2);
  expect(await queryCount(page)).toBe(queries + 1);

  await expectGroupedHeader(page, await activeGroups(page), true);
  const removed = PIVOT_COLUMNS_1.filter((id) => COLUMNS_2.includes(id) === false);
  const header = await readHeader(page);
  for (const id of removed) {
    expect(header.cells.some((entry) => entry.id.endsWith(`-h-${escapeIdPart(id)}`))).toBe(false);
  }
  const groupIds: string[] = Object.values(PIVOT_GROUP_IDS);
  for (const fragment of fragmentsOf(header)) expect(groupIds).toContain(fragment.groupId);
  expect(pageErrors).toEqual([]);
});

test("AC-012-07 a late old revision is dropped", async ({ page }, testInfo) => {
  const pageErrors = await armPivot(page, testInfo.project.name, "external");
  const rowCount = (await viewRows(page)).length;

  await page.getByTestId("pivot-hold-next").click();
  await page.getByTestId("pivot-refresh").click();
  await page.getByTestId("pivot-replace-revision").click();
  // Revision 2 lands while the revision 1 query is still pending.
  await expect.poll(() => pivotRevision(page)).toBe(2);
  await expectLiterals(page, PIVOT_VALUES_2, [total, north, south], PIVOT_COLUMNS_2);
  await page.getByTestId("pivot-release").click();

  await expect.poll(() => pivotRevision(page)).toBe(2);
  await expectLiterals(page, PIVOT_VALUES_2, [total, north, south], PIVOT_COLUMNS_2);
  await nextFrames(page);
  await nextFrames(page);
  expect(await pivotRevision(page)).toBe(2);
  await expectLiterals(page, PIVOT_VALUES_2, [total, north, south], PIVOT_COLUMNS_2);
  expect(await columnIds(page)).toEqual(COLUMNS_2);
  expect((await viewRows(page)).length).toBe(rowCount);
  expect(await queryCount(page)).toBe(3);
  expect(pageErrors).toEqual([]);
});

test("AC-012-06 a double-click on a pivot cell opens no editor", async ({ page }, testInfo) => {
  const pageErrors = await armPivot(page, testInfo.project.name, "external");
  await cell(page, 0, 1).dblclick();
  await cell(page, 1, 2).dblclick();
  await cell(page, 1, LABEL).dblclick();
  await nextFrames(page);
  await expect(page.locator('[role="gridcell"] input')).toHaveCount(0);
  await expect(page.locator(".gp-grid-edit-input")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("AC-012-03 a thousand keys stay windowed and keep the header height", async ({ page }, testInfo) => {
  const pageErrors = await armPivot(page, testInfo.project.name, "wide");
  await expect.poll(async () => (await columnIds(page)).length).toBe(1 + PIVOT_WIDE_KEY_COUNT * 2);
  const bands = await headerBands(page);
  expect(bands?.count).toBe(2);
  const mountedLeaves = () => page.locator(".gp-grid-header-cell[data-col-index]").count();
  const mountedCells = () => page.locator('[data-cell-row="0"]').count();
  expect(await mountedLeaves()).toBeLessThan(200);
  expect(await mountedCells()).toBeLessThan(200);
  const height = (await readHeader(page)).clientHeight;

  await scrollBody(page, 0, 20000);

  await expect.poll(() => page.locator(".gp-grid-header-cell[data-col-index]").evaluateAll((nodes) =>
    Math.max(...nodes.map((node) => Number(node.getAttribute("data-col-index")))))).toBeGreaterThan(100);
  expect((await headerBands(page))?.totalHeight).toBe(bands?.totalHeight);
  expect((await readHeader(page)).clientHeight).toBe(height);
  expect(await mountedLeaves()).toBeLessThan(200);
  expect(await mountedCells()).toBeLessThan(200);
  expect(pageErrors).toEqual([]);
});

// eslint-disable-next-line no-empty-pattern
test("AC-012-07 the precomputed fixture imports no engine", async ({}, testInfo) => {
  const fixture = pivotFixtureSource(testInfo.project.name, "conformance-pivot-external.ts");
  const data = pivotFixtureSource(testInfo.project.name, "conformance-pivot-external-data.ts");
  const imports = fixture.split("\n").filter((line) => line.startsWith("import "));
  expect(imports.length).toBeGreaterThan(0);
  for (const line of imports) expect(line).toMatch(/^import (type )?\{/);
  const values = fixture.match(/^import \{([^}]*)\} from "@gp-grid\/[a-z]+";$/m)?.[1]?.split(",").map((name) => name.trim()).sort();
  expect(values).toEqual(["PIVOT_LABEL_COLUMN_ID", "buildPivotSchema", "encodeGroupId", "encodePivotColumnId"]);
  expect(fixture).not.toMatch(/createPivotSource|createRowGrouping|createServerGroupingSource|row-grouping|server-grouping/);
  expect(data).not.toMatch(/^import /m);
});
