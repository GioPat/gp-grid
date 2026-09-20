import { expect, test, type Locator, type Page } from "@playwright/test";
import { openFixture, readHook } from "./helpers";

interface LayoutColumnSnapshot {
  columnId: string;
  layoutIndex: number;
  offset: number;
  width: number;
}

interface CellBoundsSnapshot {
  top: number;
  left: number;
  width: number;
  height: number;
}

const TOLERANCE = 1;
/**
 * Browser sub-pixel rounding of an absolutely positioned overlay. The preview
 * line is a 1 px border positioned at a fractional offset, so a whole device
 * pixel of rounding is expected.
 */
const OVERLAY_TOLERANCE = 3.5;

const layoutColumns = (page: Page): Promise<LayoutColumnSnapshot[]> =>
  readHook<LayoutColumnSnapshot[]>(page, "layoutColumns");

/**
 * Resolve the index-space bounds and the identity-space bounds in one
 * evaluation so both read the same committed snapshot and scroll sample.
 */
const boundsByIndexAndIdentity = async (
  page: Page,
  row: number,
  layoutIndex: number,
  columnId: string,
): Promise<{ index: CellBoundsSnapshot | null; identity: CellBoundsSnapshot | null }> =>
  page.evaluate(
    ({ targetRow, targetIndex, targetColumnId }) => {
      const hooks = (globalThis as unknown as {
        __gpConformance?: {
          cellBounds: (row: number, col: number) => CellBoundsSnapshot | null;
          identityBounds: (rowId: string | number, columnId: string) => CellBoundsSnapshot | null;
        };
      }).__gpConformance;
      return {
        index: hooks?.cellBounds(targetRow, targetIndex) ?? null,
        identity: hooks?.identityBounds(targetRow, targetColumnId) ?? null,
      };
    },
    { targetRow: row, targetIndex: layoutIndex, targetColumnId: columnId },
  );

const activeCell = (page: Page): Promise<{ row: number; col: number } | null> =>
  readHook<{ row: number; col: number } | null>(page, "activeCell");

const bodyScroller = (page: Page): Locator => page.locator(".gp-grid-rows-wrapper").locator("xpath=../..");

const bodyMetrics = (page: Page): Promise<{ scrollTop: number; scrollLeft: number; clientWidth: number; clientHeight: number }> =>
  bodyScroller(page).evaluate((element) => ({
    scrollTop: element.scrollTop,
    scrollLeft: element.scrollLeft,
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
  }));

const scrollBodyTo = async (page: Page, top: number, left: number): Promise<void> => {
  await bodyScroller(page).evaluate((element, position) => {
    element.scrollTo({ top: position.top, left: position.left });
    element.dispatchEvent(new Event("scroll"));
  }, { top, left });
  await expect.poll(async () => (await bodyMetrics(page)).scrollLeft).toBeGreaterThanOrEqual(left);
};

/**
 * Header and first-row cell must agree on x and width for every column, and
 * the committed snapshot must agree with what was rendered. Adapters publish
 * the layout asynchronously, so poll until the rendered geometry matches the
 * committed one instead of sampling a mid-update frame.
 */
const expectAligned = async (page: Page): Promise<void> => {
  await expect
    .poll(async () => {
      const columns = await layoutColumns(page);
      for (const column of columns) {
        const header = await page
          .locator(`.gp-grid-header-cell[data-col-index="${column.layoutIndex}"]`)
          .boundingBox();
        const cell = await page
          .locator(`[data-cell-row="0"][data-cell-col="${column.layoutIndex}"]`)
          .boundingBox();
        if (header === null || cell === null) return false;
        if (Math.abs(header.width - column.width) > TOLERANCE) return false;
      }
      return true;
    })
    .toBe(true);

  const columns = await layoutColumns(page);
  expect(columns.length).toBeGreaterThan(0);
  await expect(page.locator(".gp-grid-header-cell")).toHaveCount(columns.length);
  for (const column of columns) {
    const header = page.locator(
      `.gp-grid-header-cell[data-col-index="${column.layoutIndex}"]`,
    );
    const cell = page.locator(
      `[data-cell-row="0"][data-cell-col="${column.layoutIndex}"]`,
    );
    await expect(header).toHaveCount(1);
    await expect(cell).toHaveCount(1);
    const headerBox = await header.boundingBox();
    const cellBox = await cell.boundingBox();
    if (headerBox === null || cellBox === null) {
      throw new Error(`Column ${column.columnId} is not measurable.`);
    }
    expect(Math.abs(headerBox.x - cellBox.x)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(headerBox.width - cellBox.width)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(headerBox.width - column.width)).toBeLessThanOrEqual(TOLERANCE);
  }
};

const hostScrollerWidth = async (page: Page): Promise<number> =>
  (await bodyMetrics(page)).clientWidth;

test("fit fills the host and fixed keeps declared widths", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await page.getByTestId("use-narrow-columns").click();
  await expect(page.locator(".gp-grid-header-cell")).toHaveCount(3);
  await expectAligned(page);

  const host = await hostScrollerWidth(page);
  const fitted = await layoutColumns(page);
  const fittedTotal = fitted.reduce((total, column) => total + column.width, 0);
  expect(Math.abs(fittedTotal - host)).toBeLessThanOrEqual(TOLERANCE);

  await page.getByTestId("toggle-column-layout").click();
  await expect.poll(async () => (await layoutColumns(page))[0]?.width).toBe(100);
  // The rendered headers follow the committed snapshot in the same batch.
  await expect
    .poll(async () => {
      const box = await page
        .locator('.gp-grid-header-cell[data-col-index="0"]')
        .boundingBox();
      return Math.round(box?.width ?? 0);
    })
    .toBe(100);
  expect(await layoutColumns(page)).toMatchObject([
    { columnId: "id", width: 100 },
    { columnId: "name", width: 120 },
    { columnId: "city", width: 140 },
  ]);
  await expectAligned(page);
  expect(pageErrors).toEqual([]);
});

test("a resized column keeps its exact width through a host resize", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await page.getByTestId("use-narrow-columns").click();
  await expect(page.locator(".gp-grid-header-cell")).toHaveCount(3);

  const header = page.locator('.gp-grid-header-cell[data-col-index="0"]');
  const handle = header.locator(".gp-grid-header-resize-handle");
  const handleBox = await handle.boundingBox();
  if (handleBox === null) throw new Error("Resize handle is not measurable.");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 60, handleBox.y + handleBox.height / 2);
  await page.mouse.up();

  await expect.poll(async () => (await layoutColumns(page))[0]?.width).toBeGreaterThan(120);
  const resized = (await layoutColumns(page))[0]!;
  await expectAligned(page);

  await page.getByTestId("resize-host").click();
  await expect.poll(() => hostScrollerWidth(page)).toBe(800);
  await expectAligned(page);
  // An explicit override survives a host resize.
  expect((await layoutColumns(page))[0]?.width).toBe(resized.width);

  await page.getByTestId("reset-column-state").click();
  await expect.poll(async () => (await layoutColumns(page))[0]?.width).toBeLessThan(resized.width);
  await expectAligned(page);
  expect(pageErrors).toEqual([]);
});

test("header, cells and overlays follow resize, hide, move and host resize", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await page.getByTestId("use-narrow-columns").click();
  await expect(page.locator(".gp-grid-header-cell")).toHaveCount(3);

  // Preview line marks the committed left edge plus the ghost width.
  const header = page.locator('.gp-grid-header-cell[data-col-index="1"]');
  const handle = header.locator(".gp-grid-header-resize-handle");
  const handleBox = await handle.boundingBox();
  if (handleBox === null) throw new Error("Resize handle is not measurable.");
  const before = await layoutColumns(page);
  const startWidth = before[1]!.width;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 40, handleBox.y + handleBox.height / 2, { steps: 4 });

  const metrics = await bodyMetrics(page);
  const line = page.locator(".gp-grid-column-resize-line");
  await expect(line).toHaveCount(1);
  const lineBox = await line.boundingBox();
  if (lineBox === null) throw new Error("Resize line is not measurable.");
  const previewWidth = startWidth + 40;
  const expectedLineX = before[1]!.offset + previewWidth - metrics.scrollLeft;
  const containerBox = await page.locator(".gp-grid-container").boundingBox();
  if (containerBox === null) throw new Error("Grid container is not measurable.");
  expect(
    Math.abs(lineBox.x - (containerBox.x + expectedLineX)),
  ).toBeLessThanOrEqual(OVERLAY_TOLERANCE);

  // The header keeps its committed width until pointer-up.
  await expect.poll(async () => (await layoutColumns(page))[1]!.width).toBe(startWidth);
  await page.mouse.up();

  const after = await layoutColumns(page);
  expect(after[1]!.width).toBeGreaterThan(startWidth);
  await expectAligned(page);

  // Hide the first column: the layout loses it and nothing shifts geometrically.
  await page.getByTestId("hide-column").click();
  await expect(page.locator(".gp-grid-header-cell")).toHaveCount(2);
  await expectAligned(page);

  await page.getByTestId("move-column").click();
  await expectAligned(page);

  await page.getByTestId("resize-host").click();
  await expect.poll(() => hostScrollerWidth(page)).toBe(800);
  await expectAligned(page);
  expect(pageErrors).toEqual([]);
});

test("keyboard navigation and pointer hit-testing round-trip on a large source", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await page.getByTestId("use-large-columnar").click();
  await expect(page.locator(".gp-grid-header-cell")).toHaveCount(8);

  const scroller = bodyScroller(page);
  await scrollBodyTo(page, 0, 0);
  await expectAligned(page);

  // Navigate from the top-left corner: reaching row 15 and column 7 on a
  // source of 1,000,000 rows must move both scroll axes.
  await page.locator('[data-cell-row="0"][data-cell-col="0"]').click();
  await expect.poll(() => activeCell(page)).toEqual({ row: 0, col: 0 });
  for (let step = 0; step < 15; step += 1) {
    await page.keyboard.press("ArrowDown");
  }
  for (let step = 0; step < 7; step += 1) {
    await page.keyboard.press("ArrowRight");
  }

  const moved = await bodyMetrics(page);
  expect(moved.scrollTop).toBeGreaterThan(0);
  expect(moved.scrollLeft).toBeGreaterThan(0);

  const active = await activeCell(page);
  expect(active).toEqual({ row: 15, col: 7 });

  // The identity query resolves the same cell as the index query.
  const columnId = (await layoutColumns(page)).find(
    (column) => column.layoutIndex === active!.col,
  )?.columnId;
  expect(columnId).toBeDefined();
  const resolved = await boundsByIndexAndIdentity(page, active!.row, active!.col, columnId!);
  expect(resolved.index).not.toBeNull();
  expect(resolved.identity).not.toBeNull();
  expect(Math.abs(resolved.identity!.left - resolved.index!.left)).toBeLessThanOrEqual(TOLERANCE);
  expect(Math.abs(resolved.identity!.top - resolved.index!.top)).toBeLessThanOrEqual(TOLERANCE);

  // Move away first, so the click below has to select the cell again: the
  // source is compressed here, and bounds in DOM px would miss the body.
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => activeCell(page)).toEqual({ row: active!.row, col: active!.col - 1 });
  const target = await boundsByIndexAndIdentity(page, active!.row, active!.col, columnId!);
  expect(target.index).not.toBeNull();

  // Clicking the centre of the queried bounds recovers the same cell.
  const scrollerBox = await scroller.boundingBox();
  if (scrollerBox === null) throw new Error("Body scroller is not measurable.");
  await page.mouse.click(
    scrollerBox.x + target.index!.left + target.index!.width / 2,
    scrollerBox.y + target.index!.top + target.index!.height / 2,
  );
  await expect.poll(() => activeCell(page)).toEqual(active);
  expect(pageErrors).toEqual([]);
});
