// benchmarks/conformance/row-groups-interaction.spec.ts
// AC-008-04/05: leaf edits, writes refused on group rows, the expander and key
// gestures, and toggles against heights, frozen rows, focus and the anchor.
// Runs in the react, vue and angular projects.

import { expect, test, type Page } from "@playwright/test";
import { cell, TOLERANCE } from "./helpers";
import { activeCell, rowRegions } from "./frozen-rows-helpers";
import { activateCell, selectionRange } from "./pinning-helpers";
import { bodyMetrics, boxAt, firstVisibleRow, rowHeightAt, waitForScroll } from "./row-heights-helpers";
import {
  AMOUNT,
  armRowGroups,
  container,
  COUNTRY,
  countryOf,
  editor,
  expander,
  groupIndex,
  indexOfId,
  NAME,
  pasteText,
  queryCount,
  records,
  ROW_HEIGHT,
  rowGroupEvents,
  setExpanded,
  sumOf,
  TALL_HEIGHT,
  TALL_LEAF_ID,
  viewRows,
  waitForExpanded,
  type ViewRowSnapshot,
} from "./row-groups-helpers";

/** IT / City 0 holds ids 0, 15, 30, ...; IT / City 1 holds 10, 25, 40, ... */
const IT_CITY0_SECOND = 15;

/** Expand a country, then cities of it, by the keys the view rows report. */
const expandPath = async (page: Page, country: unknown, cities: readonly string[]): Promise<ViewRowSnapshot[]> => {
  const countryId = (await viewRows(page)).find((row) => row.depth === 0 && row.value === country)!.id;
  await setExpanded(page, [countryId], true);
  const start = await waitForExpanded(page, countryId, true);
  const rows = await viewRows(page);
  const cityIds = cities.map((city) => rows[groupIndex(rows, city, 1, start)]!.id);
  if (cityIds.length > 0) {
    await setExpanded(page, cityIds, true);
    await waitForExpanded(page, cityIds.at(-1)!, true);
  }
  return viewRows(page);
};

/** The sums the engine must report for the records as the grid wrote them. */
const expectSumsMatchRecords = async (page: Page): Promise<void> => {
  const leaves = await records(page);
  const rows = await viewRows(page);
  expect(rows[0]!.values.amount).toBe(sumOf(leaves.map((record) => record.amount)));
  for (const row of rows.filter((entry) => entry.kind === "group" && entry.depth === 0)) {
    const members = leaves.filter((record) => countryOf(record) === row.value);
    expect(row.values.amount, `group ${String(row.value)}`).toBe(sumOf(members.map((record) => record.amount)));
  }
};

test("AC-008-04 a leaf edit refolds its group and the total", async ({ page }, testInfo) => {
  const pageErrors = await armRowGroups(page, testInfo.project.name, "object");
  const rows = await expandPath(page, "IT", ["City 0"]);
  const it = groupIndex(rows, "IT");
  const leaf = indexOfId(rows, IT_CITY0_SECOND);

  await cell(page, leaf, AMOUNT).dblclick();
  await editor(page).fill("100");
  await editor(page).press("Enter");

  await expect(editor(page)).toHaveCount(0);
  await expect.poll(async () => (await viewRows(page))[it]!.values.amount).not.toBe(rows[it]!.values.amount);
  expect((await viewRows(page))[0]!.values.amount).not.toBe(rows[0]!.values.amount);
  await expectSumsMatchRecords(page);
  expect(pageErrors).toEqual([]);
});

test("AC-008-04 a country edit moves the row and the active cell follows it", async ({ page }, testInfo) => {
  const pageErrors = await armRowGroups(page, testInfo.project.name, "object");
  const rows = await expandPath(page, "IT", ["City 0"]);
  const leaf = indexOfId(rows, IT_CITY0_SECOND);

  await cell(page, leaf, COUNTRY).dblclick();
  await editor(page).fill("FR");
  await editor(page).press("Enter");

  await expect.poll(async () => {
    const position = await activeCell(page);
    return position === null ? null : (await viewRows(page))[position.row]?.id;
  }).toBe(IT_CITY0_SECOND);
  expect((await activeCell(page))?.col).toBe(COUNTRY);
  const moved = await viewRows(page);
  const fr = moved[groupIndex(moved, "FR")]!;
  expect(fr.expanded).toBe(true);
  expect(fr.leafCount).toBe(201);
  expect(moved[groupIndex(moved, "IT")]!.leafCount).toBe(199);
  // Every collapsed ancestor of the new position opened, so the row is visible.
  const position = indexOfId(moved, IT_CITY0_SECOND);
  expect(position).toBeGreaterThan(groupIndex(moved, "FR"));
  expect(position).toBeLessThan(groupIndex(moved, "IT"));
  await expectSumsMatchRecords(page);
  expect(pageErrors).toEqual([]);
});

test("AC-008-04 a double-click, F2 and typing on a group row open no editor", async ({ page }, testInfo) => {
  const pageErrors = await armRowGroups(page, testInfo.project.name, "object");
  const rows = await viewRows(page);
  const fr = groupIndex(rows, "FR");

  // A double-click on any cell of a group row toggles it (D5).
  await cell(page, fr, AMOUNT).dblclick();
  await waitForExpanded(page, rows[fr]!.id, true);
  await expect(editor(page)).toHaveCount(0);
  expect(await activeCell(page)).toEqual({ row: fr, col: AMOUNT });

  await page.keyboard.press("F2");
  await expect(editor(page)).toHaveCount(0);
  await page.keyboard.type("9");
  await page.keyboard.press("Delete");
  await expect(editor(page)).toHaveCount(0);
  expect((await viewRows(page))[fr]!.values.amount).toBe(rows[fr]!.values.amount);
  expect(await rowGroupEvents(page)).toEqual({ groupToggled: 1, writeRejected: {} });
  expect(pageErrors).toEqual([]);
});

test("AC-008-04 a paste across a group row skips each of its cells", async ({ page }, testInfo) => {
  const pageErrors = await armRowGroups(page, testInfo.project.name, "object");
  const rows = await expandPath(page, "IT", ["City 0", "City 1"]);
  const city1 = groupIndex(rows, "City 1", 1, groupIndex(rows, "IT"));
  const first = city1 - 1;

  await activateCell(page, first, NAME);
  await cell(page, first, NAME).click();
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowRight");
  expect(await selectionRange(page)).toEqual({ startRow: first, startCol: NAME, endRow: first + 2, endCol: AMOUNT });

  await pasteText(page, "7");

  await expect.poll(async () => (await rowGroupEvents(page)).writeRejected).toEqual({ "not-a-record": 2 });
  const written = await records(page);
  for (const id of [rows[first]!.id, rows[first + 2]!.id]) {
    expect(written.find((record) => record.id === id)).toMatchObject({ amount: 7 });
  }
  await expect(cell(page, first + 2, AMOUNT)).toHaveText("7");
  await expectSumsMatchRecords(page);
  expect(pageErrors).toEqual([]);
});

test("AC-008-05 toggles keep a tall leaf and the frozen count", async ({ page }, testInfo) => {
  const pageErrors = await armRowGroups(page, testInfo.project.name, "object");
  const rows = await expandPath(page, "IT", ["City 0"]);
  const it = groupIndex(rows, "IT");
  const leaf = indexOfId(rows, TALL_LEAF_ID);
  await page.getByTestId("tall-leaf").click();
  await expect.poll(() => rowHeightAt(page, leaf)).toBe(TALL_HEIGHT);
  await page.getByTestId("freeze-two").click();
  await expect.poll(async () => (await rowRegions(page))?.frozenCount).toBe(2);

  await expander(page, it).click();
  await waitForExpanded(page, rows[it]!.id, false);
  expect((await rowRegions(page))?.frozenCount).toBe(2);
  expect(await rowHeightAt(page, it + 1)).toBe(ROW_HEIGHT);

  await expander(page, it).click();
  await waitForExpanded(page, rows[it]!.id, true);
  // City 0 kept its expansion, so the leaf is back at its index with its height.
  expect(indexOfId(await viewRows(page), TALL_LEAF_ID)).toBe(leaf);
  await expect.poll(() => rowHeightAt(page, leaf)).toBe(TALL_HEIGHT);
  await expect.poll(async () => Math.abs(((await boxAt(page, leaf))?.height ?? 0) - TALL_HEIGHT))
    .toBeLessThanOrEqual(TOLERANCE);
  const regions = await rowRegions(page);
  expect(regions?.frozenCount).toBe(2);
  expect(regions?.frozenExtent).toBe(2 * ROW_HEIGHT);
  await expect(page.locator(".gp-grid-frozen-rows .gp-grid-row")).toHaveCount(2);
  expect(pageErrors).toEqual([]);
});

test("AC-008-05 collapsing the active cell's group moves it to the group row", async ({ page }, testInfo) => {
  const pageErrors = await armRowGroups(page, testInfo.project.name, "object");
  const rows = await expandPath(page, "IT", ["City 0"]);
  const it = groupIndex(rows, "IT");
  const leaf = indexOfId(rows, IT_CITY0_SECOND);
  await cell(page, leaf, NAME).click();
  expect(await activeCell(page)).toEqual({ row: leaf, col: NAME });

  await expander(page, it).click();

  await waitForExpanded(page, rows[it]!.id, false);
  await expect.poll(() => activeCell(page)).toEqual({ row: it, col: NAME });
  await expect(cell(page, it, NAME)).toHaveClass(/gp-grid-cell--active/);
  expect(pageErrors).toEqual([]);
});

test("AC-008-05 collapsing a group above the viewport keeps the first visible row", async ({ page }, testInfo) => {
  const pageErrors = await armRowGroups(page, testInfo.project.name, "object");
  await page.getByTestId("expand-all").click();
  await expect.poll(async () => (await viewRows(page)).length).toBeGreaterThan(1000);
  await waitForScroll(page, 3200, 0);

  const before = await viewRows(page);
  const anchor = await firstVisibleRow(page);
  const anchorId = before[anchor]!.id;
  const anchorTop = (await boxAt(page, anchor))!.top;
  // The empty-string country's first city lies wholly above the viewport.
  const above = before[groupIndex(before, "City 0", 1, groupIndex(before, ""))]!;
  const removed = above.leafCount!;
  expect(above.index + removed).toBeLessThan(anchor);
  const scrollTop = (await bodyMetrics(page)).scrollTop;

  expect(await setExpanded(page, [above.id], false)).toBe("applied");

  await expect.poll(async () => indexOfId(await viewRows(page), anchorId)).toBe(anchor - removed);
  await expect.poll(async () => scrollTop - (await bodyMetrics(page)).scrollTop).toBe(removed * ROW_HEIGHT);
  await expect.poll(async () => Math.abs(((await boxAt(page, anchor - removed))?.top ?? -1e6) - anchorTop))
    .toBeLessThanOrEqual(TOLERANCE);
  expect(pageErrors).toEqual([]);
});

test("AC-008-05 Enter and Space toggle a group row with no pointer", async ({ page }, testInfo) => {
  const pageErrors = await armRowGroups(page, testInfo.project.name, "object");
  const rows = await viewRows(page);
  const empty = groupIndex(rows, "");
  const queries = await queryCount(page);
  await container(page).focus();
  await activateCell(page, empty, NAME);
  await expect.poll(() => activeCell(page)).toEqual({ row: empty, col: NAME });

  await page.keyboard.press("Enter");
  await waitForExpanded(page, rows[empty]!.id, true);
  await expect(editor(page)).toHaveCount(0);
  await page.keyboard.press("Space");
  await waitForExpanded(page, rows[empty]!.id, false);

  expect((await rowGroupEvents(page)).groupToggled).toBe(2);
  expect(await activeCell(page)).toEqual({ row: empty, col: NAME });
  expect(await queryCount(page)).toBe(queries);
  expect(pageErrors).toEqual([]);
});

test("a double-click on the expander toggles once per press", async ({ page }, testInfo) => {
  const pageErrors = await armRowGroups(page, testInfo.project.name, "object");
  const rows = await viewRows(page);
  const fr = groupIndex(rows, "FR");

  // Two presses toggle twice; the expander keeps the cell's own double-click
  // from toggling a third time.
  await expander(page, fr).dblclick();

  await expect.poll(async () => (await rowGroupEvents(page)).groupToggled).toBe(2);
  await waitForExpanded(page, rows[fr]!.id, false);
  await expect(editor(page)).toHaveCount(0);
  expect(await activeCell(page)).toBeNull();
  expect(pageErrors).toEqual([]);
});
