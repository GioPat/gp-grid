// benchmarks/conformance/row-heights-scroll.spec.ts
// AC-006-02/05: the 480 px last row at both scroll extremes, hit-testing down a
// tall row, a synthetic touch swipe and the paged arrival of a pending height.
// Runs in the react, vue and angular projects.

import { expect, test, type Page } from "@playwright/test";
import { cell, TOLERANCE } from "./helpers";
import { activateCell } from "./pinning-helpers";
import { activeCell, bodyMetrics, waitForScroll } from "./frozen-rows-helpers";
import {
  armRowHeights,
  boxAt,
  contentSize,
  expectRowsOnCoreBounds,
  firstVisibleRow,
  LAST_INDEX,
  mountedRows,
  PAGE_SIZE,
  PAGED_ID,
  requestedRanges,
  ROW_HEIGHT,
  rowBounds,
  rowHeightAt,
  rowHeightOverrides,
  scrollToEnd,
  swipeRows,
  waitForHeight,
} from "./row-heights-helpers";

/** Mid-scroll offset inside the compressed range of the large arm. */
const COMPRESSED_TOP = 50_000;
/** The paged scroll target: the clip top sits 50 rows past the override. */
const PAGED_ANCHOR = PAGED_ID + 50;

test("shows the tall last row at both scroll extremes", async ({ page }, testInfo) => {
  const pageErrors = await armRowHeights(page, testInfo.project.name, "large");
  await waitForHeight(page, LAST_INDEX, 480);
  expect(await rowHeightAt(page, 1)).toBe(64);
  expect(await rowHeightAt(page, 2)).toBe(96);

  await activateCell(page, LAST_INDEX, 0);
  await expect.poll(async () => Math.abs((await rowBounds(page, LAST_INDEX, "viewport"))!.start))
    .toBeLessThanOrEqual(TOLERANCE + 1);
  const top = await boxAt(page, LAST_INDEX);
  expect(Math.abs(top!.height - 480)).toBeLessThanOrEqual(TOLERANCE);

  const metrics = await bodyMetrics(page);
  await scrollToEnd(page);
  const end = await boxAt(page, LAST_INDEX);
  expect(Math.abs(end!.top + end!.height - metrics.clientHeight)).toBeLessThanOrEqual(3);
  expect(pageErrors).toEqual([]);
});

test("activates the row under a click three quarters down a tall row", async ({ page }, testInfo) => {
  const pageErrors = await armRowHeights(page, testInfo.project.name, "large");
  await activateCell(page, LAST_INDEX, 0);

  const box = await cell(page, LAST_INDEX, 0).boundingBox();
  if (box === null) throw new Error("The tall row's cell is not measurable.");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.75);

  await expect.poll(async () => (await activeCell(page))?.row).toBe(LAST_INDEX);
  expect(pageErrors).toEqual([]);
});

test("keeps the rows on their core bounds through a synthetic touch swipe", async ({ page }, testInfo) => {
  const pageErrors = await armRowHeights(page, testInfo.project.name, "large");
  await waitForScroll(page, COMPRESSED_TOP, 0);
  const before = (await bodyMetrics(page)).scrollTop;

  await swipeRows(page, 120);

  await expect.poll(async () => (await bodyMetrics(page)).scrollTop).toBeGreaterThan(before);
  // Compressed scroll rounds the DOM sample, so the tolerance covers the ratio.
  await expectRowsOnCoreBounds(page, TOLERANCE + 1);
  expect(pageErrors).toEqual([]);
});

/** Page starts covering the mounted rows, in order. */
const mountedBlocks = async (page: Page): Promise<number[]> => {
  const indices = (await mountedRows(page)).map((row) => row.index);
  const first = Math.floor(Math.min(...indices) / PAGE_SIZE);
  const last = Math.floor(Math.max(...indices) / PAGE_SIZE);
  return Array.from({ length: last - first + 1 }, (_, offset) => (first + offset) * PAGE_SIZE);
};

test("AC-006-05 places a pending height when its page arrives", async ({ page }, testInfo) => {
  // Reference: the same scroll with no height waiting for its page.
  await armRowHeights(page, testInfo.project.name, "paged");
  await page.getByTestId("reset-row-heights").click();
  await expect.poll(async () => (await rowHeightOverrides(page)).length).toBe(0);
  await activateCell(page, PAGED_ANCHOR, 0);
  await expect.poll(async () => (await requestedRanges(page)).length).toBe(2);
  const reference = await boxAt(page, PAGED_ANCHOR);

  const pageErrors = await armRowHeights(page, testInfo.project.name, "paged");
  expect(await rowHeightOverrides(page)).toEqual([{ rowId: PAGED_ID, height: 96 }]);
  // The override is stored but waits: its row is many pages below the window.
  await waitForHeight(page, PAGED_ID, ROW_HEIGHT);
  const sizer = await contentSize(page);

  // The clip top lands past the override, so the arrival must correct the
  // scroll to keep the rows where the reference put them.
  await activateCell(page, PAGED_ANCHOR, 0);
  await waitForHeight(page, PAGED_ID, 96);

  await expectRowsOnCoreBounds(page, TOLERANCE + 1);
  const anchored = await boxAt(page, PAGED_ANCHOR);
  expect(Math.abs(anchored!.top - reference!.top)).toBeLessThanOrEqual(TOLERANCE + 1);
  // The axis extent takes the 64 px the placed row adds.
  await expect.poll(async () => Math.round((await contentSize(page))!.height - sizer!.height)).toBe(64);
  expect(pageErrors).toEqual([]);
});

test("AC-006-05 requests exactly the blocks of the windows it showed", async ({ page }, testInfo) => {
  const pageErrors = await armRowHeights(page, testInfo.project.name, "paged");
  const initial = await mountedBlocks(page);
  await activateCell(page, PAGED_ANCHOR, 0);
  await waitForHeight(page, PAGED_ID, 96);

  const expected = [...initial, ...(await mountedBlocks(page))].map((startRow) => ({
    startRow,
    endRow: startRow + PAGE_SIZE,
  }));
  expect(await requestedRanges(page)).toEqual(expected);
  expect(pageErrors).toEqual([]);
});
