// benchmarks/conformance/row-heights.spec.ts
// AC-006-01/03/04: the published heights on the mounted boxes and cells, the
// sizer growth, identity across a sort, the above-viewport anchor and the
// frozen band. Runs in the react, vue and angular projects.

import { expect, test } from "@playwright/test";
import { rowRegions, waitForScroll } from "./frozen-rows-helpers";
import { TOLERANCE } from "./helpers";
import { sortColumn } from "./helpers";
import {
  armRowHeights,
  bodyMetrics,
  boxAt,
  expectRowsOnCoreBounds,
  firstVisibleRow,
  FROZEN_BAND_GROWTH,
  GROWTH,
  mountedRows,
  ROW_HEIGHT,
  rowBounds,
  rowHeightAt,
  rowHeightOverrides,
  sizerHeight,
  waitForHeight,
} from "./row-heights-helpers";

/** The three IDs the in-place control sets, and the extent they add. */
const CONTROL_IDS = [2, 10, 50] as const;
const CONTROL_HEIGHTS = [96, 64, 128] as const;
const CONTROL_GROWTH = 192;
/** Mid-scroll offset for the above-viewport case, 25 rows down. */
const SCROLL_TOP = 800;

test("AC-006-01 publishes the heights on the boxes, the cells and the sizer", async ({ page }, testInfo) => {
  const pageErrors = await armRowHeights(page, testInfo.project.name, "object");
  const before = await sizerHeight(page);

  await page.getByTestId("set-row-heights").click();
  for (const [offset, rowId] of CONTROL_IDS.entries()) {
    await waitForHeight(page, rowId, CONTROL_HEIGHTS[offset]!);
  }

  await expect.poll(async () => Math.round((await sizerHeight(page)) - before)).toBe(CONTROL_GROWTH);
  expect(await rowHeightOverrides(page)).toEqual(
    CONTROL_IDS.map((rowId, offset) => ({ rowId, height: CONTROL_HEIGHTS[offset]! })),
  );

  await expectRowsOnCoreBounds(page, TOLERANCE);
  const rows = await mountedRows(page);
  // Every mounted row takes its height from the axis, not from the config.
  expect(rows.filter((row) => row.height !== ROW_HEIGHT).length).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
});

test("AC-006-03 keeps a height with its row identity across a sort", async ({ page }, testInfo) => {
  const pageErrors = await armRowHeights(page, testInfo.project.name, "object");
  await page.getByTestId("set-row-heights").click();
  await waitForHeight(page, 10, 64);

  await page.getByTestId("apply-sort").click();

  await expect.poll(async () => sortColumn(page)).toBe("score");
  // ID 10 carries the lowest score, so the sort moves it to the first row.
  await expect.poll(async () => rowHeightAt(page, 0)).toBe(64);
  // Its old index is back to the default row height.
  expect(await rowHeightAt(page, 10)).toBe(ROW_HEIGHT);
  expect(await boxAt(page, 0).then((row) => row?.height)).toBe(64);
  expect(pageErrors).toEqual([]);
});

test("AC-006-04 anchors the viewport when a row above it grows", async ({ page }, testInfo) => {
  const pageErrors = await armRowHeights(page, testInfo.project.name, "object");
  await waitForScroll(page, SCROLL_TOP, 0);

  const anchor = await firstVisibleRow(page);
  const anchorBox = await boxAt(page, anchor);
  const scrollTop = (await bodyMetrics(page)).scrollTop;

  await page.getByTestId("grow-above-viewport").click();

  await expect.poll(async () => (await bodyMetrics(page)).scrollTop - scrollTop).toBe(GROWTH);
  const grown = await boxAt(page, anchor);
  expect(Math.abs(grown!.top - anchorBox!.top)).toBeLessThanOrEqual(TOLERANCE);
  await expectRowsOnCoreBounds(page, TOLERANCE);
  expect(pageErrors).toEqual([]);
});

test("AC-006-04 grows the frozen band and keeps the suffix below it", async ({ page }, testInfo) => {
  const pageErrors = await armRowHeights(page, testInfo.project.name, "object");
  // Freeze first, so the control's own +64 is measurable against a live band.
  await page.getByTestId("freeze-count-3").click();
  await expect.poll(async () => (await rowRegions(page))?.frozenExtent).toBe(3 * ROW_HEIGHT);
  const bandBefore = (await rowRegions(page))?.frozenExtent ?? 0;

  await page.getByTestId("grow-frozen-row").click();

  await expect.poll(async () => (await rowRegions(page))?.frozenExtent)
    .toBe(bandBefore + FROZEN_BAND_GROWTH);
  expect((await rowRegions(page))?.frozenCount).toBe(3);
  // The suffix row after the band starts where the band ends, in both spaces.
  const frozenExtent = (await rowRegions(page))?.frozenExtent ?? 0;
  const suffixBounds = await rowBounds(page, 3, "viewport");
  expect(Math.abs(suffixBounds!.start - frozenExtent)).toBeLessThanOrEqual(TOLERANCE);
  expect(Math.abs((await boxAt(page, 3))!.top - frozenExtent)).toBeLessThanOrEqual(TOLERANCE);
  expect(pageErrors).toEqual([]);
});

test("reset restores the flat rows", async ({ page }, testInfo) => {
  const pageErrors = await armRowHeights(page, testInfo.project.name, "object");
  await page.getByTestId("set-row-heights").click();
  await waitForHeight(page, 50, 128);

  await page.getByTestId("reset-row-heights").click();

  await expect.poll(async () => (await rowHeightOverrides(page)).length).toBe(0);
  for (const rowId of CONTROL_IDS) {
    expect(await rowHeightAt(page, rowId)).toBe(ROW_HEIGHT);
  }
  const rows = await mountedRows(page);
  for (const row of rows) {
    expect(Math.abs(row.height - ROW_HEIGHT)).toBeLessThanOrEqual(TOLERANCE);
  }
  expect(pageErrors).toEqual([]);
});
