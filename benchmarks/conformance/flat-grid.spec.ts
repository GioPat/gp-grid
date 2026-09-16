import { expect, test, type Page } from "@playwright/test";

const openFixture = async (page: Page, framework: string): Promise<Error[]> => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await page.goto("/?conformance=1");
  await expect(page.locator("[data-conformance-framework]")).toHaveAttribute("data-conformance-framework", framework);
  await expect(page.locator('[data-cell-row="0"][data-cell-col="1"]')).toContainText("Row 000");
  return pageErrors;
};

const scrollBody = async (page: Page, top: number, left: number): Promise<void> => {
  await page.locator(".gp-grid-rows-wrapper").evaluate((element, position) => {
    const scrollElement = element.parentElement?.parentElement;
    if (scrollElement === null || scrollElement === undefined) {
      throw new Error("Unable to locate the grid scroll element.");
    }
    scrollElement.scrollTo({ top: position.top, left: position.left });
    scrollElement.dispatchEvent(new Event("scroll"));
  }, { top, left });
};

test("mount, sort, filter and remount", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  const nameHeader = page.locator('.gp-grid-header-cell[data-col-index="1"]');

  await nameHeader.click();
  await nameHeader.click();
  await expect(page.locator('[data-cell-row="0"][data-cell-col="1"]')).toContainText("Row 199");

  const scoreHeader = page.locator('.gp-grid-header-cell[data-col-index="3"]');
  await scoreHeader.locator(".gp-grid-filter-icon").click();
  await page.locator('.gp-grid-filter-number input[type="number"]').first().fill("57");
  await page.locator(".gp-grid-filter-btn-apply").click();
  await expect(page.locator('[data-cell-row="0"][data-cell-col="1"]')).toContainText("Row 019");

  await page.getByTestId("reset").click();
  await expect(page.locator('[data-cell-row="0"][data-cell-col="1"]')).toContainText("Row 000");
  await page.getByTestId("remount").click();
  await expect(page.locator('[data-cell-row="0"][data-cell-col="1"]')).toContainText("Row 000");
  await expect(page.getByTestId("metrics")).toContainText('"generation":2');
  expect(pageErrors).toEqual([]);
});

test("scroll, focus, alignment and edit", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await scrollBody(page, 3_200, 620);

  const distantCell = page.locator('[data-cell-row="100"][data-cell-col="6"]');
  await expect(distantCell).toBeVisible();
  await distantCell.click();
  await expect(distantCell).toHaveClass(/gp-grid-cell--active/);
  await expect(page.locator(".gp-grid-container")).toBeFocused();

  const headerBox = await page.locator('.gp-grid-header-cell[data-col-index="6"]').boundingBox();
  const cellBox = await distantCell.boundingBox();
  expect(headerBox).not.toBeNull();
  expect(cellBox).not.toBeNull();
  expect(Math.abs((headerBox?.x ?? 0) - (cellBox?.x ?? 0))).toBeLessThanOrEqual(1);

  await scrollBody(page, 3_200, 0);
  const editableCell = page.locator('[data-cell-row="100"][data-cell-col="1"]');
  await editableCell.dblclick();
  const input = editableCell.locator(".gp-grid-edit-input");
  await input.fill("Edited row 100");
  await input.press("Enter");
  await expect(editableCell).toContainText("Edited row 100");
  await expect(page.getByTestId("metrics")).toContainText('"editEvents":1');
  expect(pageErrors).toEqual([]);
});

test("resize a caller-owned column", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  const header = page.locator('.gp-grid-header-cell[data-col-index="1"]');
  const cell = page.locator('[data-cell-row="0"][data-cell-col="1"]');
  const initialWidth = (await header.boundingBox())?.width ?? 0;

  const handle = header.locator(".gp-grid-header-resize-handle");
  const handleBox = await handle.boundingBox();
  if (handleBox === null) {
    throw new Error("Column resize handle is not measurable.");
  }
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 45, handleBox.y + handleBox.height / 2);
  await page.mouse.up();

  await expect.poll(async () => (await header.boundingBox())?.width ?? 0).toBeGreaterThan(initialWidth + 20);
  expect(Math.abs(((await header.boundingBox())?.width ?? 0) - ((await cell.boundingBox())?.width ?? 0))).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);
});

test("replace caller-owned columns", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);

  await page.getByTestId("replace-columns").click();
  await expect(page.locator(".gp-grid-header-cell")).toHaveCount(3);
  await expect(page.locator(".gp-grid-header-cell")).toContainText(["Score", "City", "Replacement"]);
  await expect(page.locator(".gp-grid-header-cell", { hasText: "Name" })).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

// Regression for the original defect setup. The plain replacement test above
// is unmarked because it passes everywhere; the defect only reproduces once the
// column has been resized first, so the marker lives here.
test("resize then replace caller-owned columns", async ({ page }, testInfo) => {
  test.fail(
    testInfo.project.name === "vue" || testInfo.project.name === "angular",
    "Baseline defect owned by PRD 002: after a column resize, Vue and Angular do not reconcile a replacement columns input.",
  );
  const pageErrors = await openFixture(page, testInfo.project.name);
  const header = page.locator('.gp-grid-header-cell[data-col-index="1"]');
  const initialWidth = (await header.boundingBox())?.width ?? 0;

  const handle = header.locator(".gp-grid-header-resize-handle");
  const handleBox = await handle.boundingBox();
  if (handleBox === null) {
    throw new Error("Column resize handle is not measurable.");
  }
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 45, handleBox.y + handleBox.height / 2);
  await page.mouse.up();
  await expect.poll(async () => (await header.boundingBox())?.width ?? 0).toBeGreaterThan(initialWidth + 20);

  await page.getByTestId("replace-columns").click();
  await expect(page.locator(".gp-grid-header-cell")).toHaveCount(3);
  await expect(page.locator(".gp-grid-header-cell")).toContainText(["Score", "City", "Replacement"]);
  await expect(page.locator(".gp-grid-header-cell", { hasText: "Name" })).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
