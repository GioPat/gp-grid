import { expect, test, type Locator, type Page } from "@playwright/test";
import { openFixture } from "./helpers";

const FILTER_COL_INDEX = 1;
const PEEK_COL_INDEX = 0;

// Dashboard panels (e.g. Grafana) wrap content in a transformed, layout-contained
// box, which becomes the containing block of every `position: fixed` descendant.
const wrapInContainingBlock = (page: Page): Promise<void> =>
  page.locator(".gp-grid-container").first().evaluate((grid) => {
    const host = grid.parentElement;
    if (host === null) throw new Error("grid has no parent");
    host.style.transform = "translate(0, 0)";
    host.style.contain = "layout";
    host.style.margin = "40px 0 0 60px";
  });

const box = async (locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> => {
  const value = await locator.boundingBox();
  if (value === null) throw new Error("element is not rendered");
  return value;
};

test("the filter popup stays anchored under a transformed, contained ancestor", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await wrapInContainingBlock(page);
  const header = page.locator(`.gp-grid-header-cell[data-col-index="${FILTER_COL_INDEX}"]`);

  await header.locator(".gp-grid-filter-icon").click();
  const popup = page.locator(".gp-grid-filter-popup");
  await expect(popup).toBeVisible();

  const anchor = await box(header);
  const placed = await box(popup);
  expect(placed.x).toBeCloseTo(anchor.x, 0);
  expect(placed.y).toBeCloseTo(anchor.y + anchor.height + 4, 0);
  expect(pageErrors).toEqual([]);
});

test("the cell peek covers its cell under a transformed, contained ancestor", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await wrapInContainingBlock(page);
  const cell = page.locator(`[data-cell-row="0"][data-cell-col="${PEEK_COL_INDEX}"]`);

  await cell.dblclick();
  const peek = page.locator(".gp-grid-cell-peek");
  await expect(peek).toBeVisible();

  const anchor = await box(cell);
  const placed = await box(peek);
  expect(placed.x).toBeCloseTo(anchor.x, 0);
  expect(placed.y).toBeCloseTo(anchor.y, 0);
  expect(pageErrors).toEqual([]);
});

test("the column move ghost follows the pointer under a transformed, contained ancestor", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await wrapInContainingBlock(page);
  const header = await box(page.locator('.gp-grid-header-cell[data-col-index="2"]'));
  const pointer = { x: header.x + header.width / 2, y: header.y + header.height / 2 };

  await page.mouse.move(pointer.x, pointer.y);
  await page.mouse.down();
  await page.mouse.move(pointer.x + 40, pointer.y + 10, { steps: 6 });
  const ghost = await box(page.locator(".gp-grid-column-move-ghost"));
  await page.mouse.up();

  expect(ghost.x + ghost.width / 2).toBeCloseTo(pointer.x + 40, 0);
  expect(ghost.y + ghost.height / 2).toBeCloseTo(pointer.y + 10, 0);
  expect(pageErrors).toEqual([]);
});
