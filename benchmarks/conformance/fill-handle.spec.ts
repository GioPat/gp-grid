import { expect, test, type Locator, type Page } from "@playwright/test";
import { openFixture } from "./helpers";

const bodyScroller = (page: Page): Locator =>
  page.locator(".gp-grid-rows-wrapper").locator("xpath=../..");

const nameCell = (page: Page): Locator => page.locator('[data-cell-row="0"][data-cell-col="1"]');

const fillHandle = (page: Page): Locator => page.locator(".gp-grid-fill-handle");

/** Horizontal distance between the handle and its slot at the cell's right edge. */
const handleOffset = async (page: Page): Promise<number> => {
  const handle = await fillHandle(page).boundingBox();
  const cell = await nameCell(page).boundingBox();
  if (handle === null || cell === null) throw new Error("Element is not measurable.");
  return Math.abs(handle.x - (cell.x + cell.width - 20));
};

const dragResizeHandle = async (page: Page, delta: number): Promise<void> => {
  const resizer = page.locator(
    '.gp-grid-header-cell[data-col-index="1"] .gp-grid-header-resize-handle',
  );
  const box = await resizer.boundingBox();
  if (box === null) throw new Error("Element is not measurable.");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + delta, y);
  await page.mouse.up();
};

test("the fill handle stays on its cell after a horizontal scroll", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await bodyScroller(page).evaluate((element) => {
    element.scrollLeft = 100;
  });
  await expect.poll(() => bodyScroller(page).evaluate((element) => element.scrollLeft)).toBe(100);

  await nameCell(page).click();
  await expect(fillHandle(page)).toHaveCount(1);
  await expect.poll(() => handleOffset(page)).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);
});

test("the fill handle follows consecutive resizes of its column", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await nameCell(page).click();
  await expect(fillHandle(page)).toHaveCount(1);
  const width = (await nameCell(page).boundingBox())!.width;

  await dragResizeHandle(page, 60);
  await expect.poll(async () => (await nameCell(page).boundingBox())!.width).toBe(width + 60);
  await expect.poll(() => handleOffset(page)).toBeLessThanOrEqual(1);

  // The second resize must advance the revision again, not reuse the first.
  await dragResizeHandle(page, 60);
  await expect.poll(async () => (await nameCell(page).boundingBox())!.width).toBe(width + 120);
  await expect.poll(() => handleOffset(page)).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);
});

test("the fill handle unmounts when its row is recycled", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await nameCell(page).click();
  await expect(fillHandle(page)).toHaveCount(1);

  await bodyScroller(page).evaluate((element) => {
    element.scrollTop = 2000;
  });
  await expect(nameCell(page)).toHaveCount(0);
  await expect(fillHandle(page)).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
