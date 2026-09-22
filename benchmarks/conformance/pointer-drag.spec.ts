import { expect, test, type Locator, type Page } from "@playwright/test";
import { columnIds, openFixture, readHook } from "./helpers";

const bodyScroller = (page: Page): Locator =>
  page.locator(".gp-grid-rows-wrapper").locator("xpath=../..");

const scrollPosition = (page: Page): Promise<{ top: number; left: number; maxLeft: number }> =>
  bodyScroller(page).evaluate((element) => ({
    top: element.scrollTop,
    left: element.scrollLeft,
    maxLeft: element.scrollWidth - element.clientWidth,
  }));

const activeCell = (page: Page): Promise<{ row: number; col: number } | null> =>
  readHook<{ row: number; col: number } | null>(page, "activeCell");

const centerOf = async (locator: Locator): Promise<{ x: number; y: number }> => {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("Element is not measurable.");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

const cell = (page: Page, row: number, col: number): Locator =>
  page.locator(`[data-cell-row="${row}"][data-cell-col="${col}"]`);

const hideFirstColumn = async (page: Page): Promise<void> => {
  await page.getByTestId("hide-column").click();
  // The hidden "id" keeps layout index 0, so no header carries it and the
  // surviving columns keep their own indices: no renumbering. A wrapper mounts
  // only its column window, so the layout snapshot carries the index proof and
  // the DOM only has to show the hidden column gone.
  await expect
    .poll(() =>
      readHook<{ layoutIndex: number; columnId: string }[]>(page, "layoutColumns").then((all) =>
        all.map((column) => `${column.layoutIndex}:${column.columnId}`),
      ),
    )
    .toEqual(["1:name", "2:city", "3:score", "4:team", "5:status", "6:note", "7:code"]);
  await expect(page.locator('.gp-grid-header-cell[data-col-index="0"]')).toHaveCount(0);
  expect(await page.locator(".gp-grid-header-cell").count()).toBeGreaterThan(0);
};

test("a horizontal scroll correction keeps the vertical position", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await bodyScroller(page).evaluate((element) => {
    element.scrollTo({ top: 640, left: element.scrollWidth });
  });
  await expect.poll(async () => (await scrollPosition(page)).top).toBe(640);
  const before = await scrollPosition(page);
  expect(before.left).toBe(before.maxLeft);

  // Hiding a column shrinks the content, leaving scrollLeft past the new end.
  await hideFirstColumn(page);

  await expect.poll(async () => (await scrollPosition(page)).maxLeft).toBeLessThan(before.maxLeft);
  const after = await scrollPosition(page);
  expect(after.top).toBe(640);
  expect(after.left).toBe(after.maxLeft);
  expect(pageErrors).toEqual([]);
});

test("a selection drag targets the cell under the pointer past a hidden column", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await hideFirstColumn(page);

  const start = await centerOf(cell(page, 1, 1));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // Focusing the grid can scroll the page, so the target is measured now.
  const target = await centerOf(cell(page, 3, 2));
  await page.mouse.move(target.x, target.y, { steps: 8 });

  await expect.poll(() => activeCell(page)).toEqual({ row: 3, col: 2 });
  await page.mouse.up();
  expect(pageErrors).toEqual([]);
});

test("a header drag drops on the indicated column past a hidden column", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await hideFirstColumn(page);

  const source = await centerOf(page.locator('.gp-grid-header-cell[data-col-index="3"]'));
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  const target = await centerOf(page.locator('.gp-grid-header-cell[data-col-index="1"]'));
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();

  // "score" takes the slot of "name"; the hidden "id" keeps layout index 0.
  const displayed = (): Promise<string[]> =>
    readHook<{ columnId: string }[]>(page, "layoutColumns").then((all) =>
      all.map((column) => column.columnId),
    );
  await expect.poll(displayed).toEqual([
    "score", "name", "city", "team", "status", "note", "code",
  ]);
  await expect.poll(() => columnIds(page)).toEqual([
    "id", "score", "name", "city", "team", "status", "note", "code",
  ]);
  expect(pageErrors).toEqual([]);
});
