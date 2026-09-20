import { expect, test } from "@playwright/test";
import {
  COLUMNAR_ROW_COUNT,
  assertBoundedSourceReads,
  cityWidth,
  columnIds,
  columnState,
  coreToken,
  eventCounts,
  filterCount,
  openFixture,
  readCounter,
  readRawCell,
  resetEventCounts,
  resetSourceReads,
  scrollBody,
  scrollMetrics,
  sortColumn,
  useColumnar,
} from "./helpers";

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

// Regression for the original defect setup. Both the plain and the
// resize-then-replace paths now reconcile in one atomic batch.
test("resize then replace caller-owned columns", async ({ page }, testInfo) => {
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
  expect(await columnIds(page)).toEqual(["score", "city", "replacement"]);
  expect(pageErrors).toEqual([]);
});

test("replacement keeps the core instance, sort and scroll", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await page.getByTestId("apply-sort").click();
  await expect.poll(() => sortColumn(page)).toBe("score");
  await scrollBody(page, 3_200, 0);
  const token = await coreToken(page);

  await page.getByTestId("replace-columns").click();
  await expect(page.locator(".gp-grid-header-cell")).toHaveCount(3);
  await expect.poll(() => coreToken(page)).toBe(token);
  await expect.poll(() => sortColumn(page)).toBe("score");
  await expect.poll(async () => (await scrollMetrics(page)).scrollTop).toBeGreaterThanOrEqual(3_200);
  expect(pageErrors).toEqual([]);
});

test("replacement keeps a filter on a surviving column", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await page.getByTestId("apply-filter").click();
  await expect.poll(() => filterCount(page)).toBe(1);

  await page.getByTestId("replace-columns").click();
  await expect(page.locator(".gp-grid-header-cell")).toHaveCount(3);
  await expect.poll(() => filterCount(page)).toBe(1);
  expect(pageErrors).toEqual([]);
});

test("an explicit resetColumnState beats retained user state", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await page.getByTestId("apply-column-state").click();
  await expect.poll(() => cityWidth(page)).toBe(260);

  await page.getByTestId("reset-column-state").click();
  await expect.poll(() => cityWidth(page)).toBe(140);
  expect(pageErrors).toEqual([]);
});

test("resize, move and row-drag emit object events", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await resetEventCounts(page);

  const header = page.locator('.gp-grid-header-cell[data-col-index="2"]');
  const handle = header.locator(".gp-grid-header-resize-handle");
  const handleBox = await handle.boundingBox();
  if (handleBox === null) {
    throw new Error("Column resize handle is not measurable.");
  }
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 40, handleBox.y + handleBox.height / 2);
  await page.mouse.up();

  await page.getByTestId("move-column").click();
  await page.getByTestId("drag-row").click();

  const counts = await eventCounts(page);
  expect(counts.resized).toBeGreaterThanOrEqual(1);
  expect(counts.moved).toBeGreaterThanOrEqual(1);
  expect(counts.dragged).toBeGreaterThanOrEqual(1);
  expect(pageErrors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Read-only columnar source, exercised through the same fixtures.
// ---------------------------------------------------------------------------

test("columnar source renders raw and formatted values and rejects writes", async ({ page }, testInfo) => {
  const pageErrors = await useColumnar(page, testInfo.project.name);
  const nameCell = page.locator('[data-cell-row="0"][data-cell-col="1"]');
  const scoreCell = page.locator('[data-cell-row="0"][data-cell-col="3"]');

  // Formatted display value differs from the raw borrowed number.
  await expect(scoreCell).toContainText("0 pts");
  expect(await readRawCell(page, 0, 3)).toBe(0);
  // Mount reads only the mounted window, never the whole borrowed source.
  await assertBoundedSourceReads(page);

  // Double-clicking an editable column attempts an edit the source refuses.
  await nameCell.dblclick();
  await expect(page.getByTestId("metrics")).toContainText('"writeRejected":1');
  await expect(page.getByTestId("metrics")).toContainText('"editEvents":0');
  await expect(nameCell).toContainText("Row 000");
  expect(pageErrors).toEqual([]);
});

test("columnar source sorts and filters through source indices", async ({ page }, testInfo) => {
  const pageErrors = await useColumnar(page, testInfo.project.name);
  const scoreHeader = page.locator('.gp-grid-header-cell[data-col-index="3"]');

  await scoreHeader.click();
  await expect(page.locator('[data-cell-row="0"][data-cell-col="1"]')).toContainText("Row 000");
  await scoreHeader.click();
  await expect(page.locator('[data-cell-row="0"][data-cell-col="1"]')).toContainText("Row 199");
  await scoreHeader.click();
  await expect(page.locator('[data-cell-row="0"][data-cell-col="1"]')).toContainText("Row 000");

  await scoreHeader.locator(".gp-grid-filter-icon").click();
  await page.locator('.gp-grid-filter-number input[type="number"]').first().fill("57");
  await page.locator(".gp-grid-filter-btn-apply").click();
  await expect(page.locator('[data-cell-row="0"][data-cell-col="1"]')).toContainText("Row 019");
  expect(pageErrors).toEqual([]);
});

test("columnar source scrolls, focuses, aligns and copies", async ({ page, context }, testInfo) => {
  const pageErrors = await useColumnar(page, testInfo.project.name);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await resetSourceReads(page);
  await scrollBody(page, 3_200, 0);

  const distantCell = page.locator('[data-cell-row="100"][data-cell-col="1"]');
  await expect(distantCell).toBeVisible();
  await distantCell.click();
  await expect(distantCell).toHaveClass(/gp-grid-cell--active/);
  await expect(page.locator(".gp-grid-container")).toBeFocused();

  const headerBox = await page.locator('.gp-grid-header-cell[data-col-index="1"]').boundingBox();
  const cellBox = await distantCell.boundingBox();
  expect(headerBox).not.toBeNull();
  expect(cellBox).not.toBeNull();
  expect(Math.abs((headerBox?.x ?? 0) - (cellBox?.x ?? 0))).toBeLessThanOrEqual(1);

  await page.locator(".gp-grid-container").press("Control+c");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Row 100");
  // Scrolling mounts a new window without scanning the source.
  await assertBoundedSourceReads(page);
  expect(pageErrors).toEqual([]);
});

test("columnar source refreshes an in-place revision", async ({ page }, testInfo) => {
  const pageErrors = await useColumnar(page, testInfo.project.name);
  await expect(page.locator('[data-cell-row="0"][data-cell-col="3"]')).toContainText("0 pts");

  await resetSourceReads(page);
  await page.getByTestId("bump-revision").click();
  await expect(page.locator('[data-cell-row="0"][data-cell-col="1"]')).toContainText("Row revised");
  await expect(page.locator('[data-cell-row="0"][data-cell-col="3"]')).toContainText("7 pts");
  await expect(page.getByTestId("metrics")).toContainText('"revision":1');
  expect(await readRawCell(page, 0, 3)).toBe(7);
  // A revision refresh revalidates metadata without scanning the source.
  await assertBoundedSourceReads(page);
  expect(pageErrors).toEqual([]);
});
