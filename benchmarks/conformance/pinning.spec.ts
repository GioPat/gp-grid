// benchmarks/conformance/pinning.spec.ts
// A wrapper mounts only the published column
// window, while indices, focus and selection keep addressing the full layout.

import { expect, test } from "@playwright/test";
import {
  cell,
  expectAligned,
  headerCell,
  layoutColumns,
  openFixture,
  scrollBody,
} from "./helpers";
import {
  activeCell,
  activateCell,
  bodyWidth,
  COLUMN_COUNT,
  COLUMN_OVERSCAN,
  columnWindow,
  FAR_COUNT,
  MIN_WIDE_WIDTH,
  pinColumns,
  selectionRange,
  useWideColumns,
  WIDE_COUNT,
} from "./pinning-helpers";

test("a wide grid mounts a bounded, column-count-independent window", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);

  const mountedPerRow = async (count: number): Promise<number> => {
    await useWideColumns(page, count);
    await expect.poll(() => page.locator('[data-cell-row="0"][data-cell-col]').count())
      .toBeGreaterThan(0);
    const columns = await page.locator('[data-cell-row="0"][data-cell-col]').count();
    const rows = await page.locator(".gp-grid-row").count();
    // Every mounted row carries the same window, so the totals must agree.
    await expect.poll(() => page.locator("[data-cell-col]").count()).toBe(columns * rows);

    const bound = Math.ceil(((await bodyWidth(page)) + 2 * COLUMN_OVERSCAN) / MIN_WIDE_WIDTH) + 1;
    expect(columns).toBeGreaterThan(0);
    expect(columns).toBeLessThanOrEqual(bound);
    // The window is the presented range plus any retained column.
    const window = await columnWindow(page);
    expect(window!.center.length).toBeGreaterThanOrEqual(window!.range.end - window!.range.start);
    return columns;
  };

  const wide = await mountedPerRow(WIDE_COUNT);
  const huge = await mountedPerRow(FAR_COUNT);
  expect(huge).toBe(wide);
  expect(pageErrors).toEqual([]);
});

test("header and first row stay aligned through scroll, resize, move, pin and unpin", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await expectAligned(page, COLUMN_COUNT);

  // Past the overscan, so the presented range has moved off column 0.
  await scrollBody(page, 0, 400);
  await expect.poll(async () => (await columnWindow(page))?.range.start ?? 0).toBeGreaterThan(0);
  await expectAligned(page, COLUMN_COUNT);

  const handle = headerCell(page, 1).locator(".gp-grid-header-resize-handle");
  const handleBox = await handle.boundingBox();
  if (handleBox === null) throw new Error("Resize handle is not measurable.");
  const y = handleBox.y + handleBox.height / 2;
  await page.mouse.move(handleBox.x + handleBox.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 40, y, { steps: 4 });
  await page.mouse.up();
  await expectAligned(page, COLUMN_COUNT);

  await page.getByTestId("move-column").click();
  await expectAligned(page, COLUMN_COUNT);

  await pinColumns(page);
  await expectAligned(page, COLUMN_COUNT);

  await page.getByTestId("unpin-all").click();
  await expect(page.locator(".gp-grid-pin-header")).toHaveCount(0);
  await expectAligned(page, COLUMN_COUNT);

  await page.getByTestId("hide-column").click();
  await expectAligned(page, COLUMN_COUNT - 1);
  expect(pageErrors).toEqual([]);
});

test("focus and selection cross the window boundary without skipping columns", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await useWideColumns(page, WIDE_COUNT);

  await cell(page, 0, 0).click();
  await expect.poll(() => activeCell(page)).toEqual({ row: 0, col: 0 });

  // Held ArrowRight walks past the mounted window: the target must mount.
  for (let step = 0; step < 40; step += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await expect.poll(() => activeCell(page)).toEqual({ row: 0, col: 40 });
  await expect.poll(async () => (await columnWindow(page))?.center.includes("w40") ?? false)
    .toBe(true);
  expect((await columnWindow(page))!.range.start).toBeGreaterThan(0);
  await expect(cell(page, 0, 40)).toHaveCount(1);

  // A programmatic activation mounts and focuses a far column.
  await activateCell(page, 0, 900);
  await expect.poll(() => activeCell(page)).toEqual({ row: 0, col: 900 });
  await expect.poll(async () => (await columnWindow(page))?.center.includes("w900") ?? false)
    .toBe(true);
  await expect(cell(page, 0, 900)).toHaveCount(1);

  // Extending the selection addresses the neighbouring columnIds, not a remount gap.
  for (let step = 0; step < 3; step += 1) {
    await page.keyboard.press("Shift+ArrowRight");
  }
  expect(await selectionRange(page)).toEqual({
    startRow: 0,
    startCol: 900,
    endRow: 0,
    endCol: 903,
  });
  const columns = await layoutColumns(page);
  expect([columns[900]!.columnId, columns[903]!.columnId]).toEqual(["w900", "w903"]);
  await expect(page.locator('[data-cell-col="901"].gp-grid-cell--selected')).toHaveCount(1);
  expect(pageErrors).toEqual([]);
});
