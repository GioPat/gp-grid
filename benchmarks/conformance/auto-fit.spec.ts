// benchmarks/conformance/auto-fit.spec.ts
// AC-007-01/03/04/05/06/07/11: row edge drags and Alt+Arrow steps, edge
// double-click fits against the rendered content, the fit results, anchors,
// nothing left behind and the grid keys. Runs in the react, vue and angular
// projects.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { activeCell, rowRegions } from "./frozen-rows-helpers";
import { cell, columnIds, columnState, resetEventCounts, TOLERANCE } from "./helpers";
import { activateCell } from "./pinning-helpers";
import {
  bodyMetrics,
  boxAt,
  firstVisibleRow,
  requestedRanges,
  rowHeightAt,
  rowHeightOverrides,
  waitForHeight,
  waitForScroll,
} from "./row-heights-helpers";
import {
  armAutoFit,
  C0,
  cellBoxes,
  clamp,
  COLUMN_IDS,
  columnHandle,
  expectContiguousRows,
  fitColumns,
  fitEventCounts,
  fitRows,
  focusedClass,
  generation,
  grid,
  ID,
  lastFitResult,
  layoutIndexOf,
  layoutWidth,
  MAX_COLUMN_WIDTH,
  MAX_ROW_HEIGHT,
  MIN_COLUMN_WIDTH,
  mountedRowCount,
  NAME,
  NAME_MAX_WIDTH,
  nextFrames,
  NOTES,
  ROW_HEIGHT,
  rowHandle,
  rowResizeLine,
  sampleIntrinsic,
  setColumnWidth,
  settledNodeCount,
  stylesAroundFits,
  SUMMARY,
  tallestInRow,
  waitForColumnWidth,
  widestInColumn,
} from "./auto-fit-helpers";

/** AC-007-01 drag distance. */
const DRAG = 40;
/** Mid-scroll offset, 25 rows down. */
const SCROLL_TOP = 800;

const centerOf = async (locator: Locator): Promise<{ x: number; y: number }> => {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("Element is not measurable.");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** Press on a row's edge handle inside one cell, drag it by `dy` and hold it there. */
const pressRowEdge = async (page: Page, row: number, dy: number, layoutIndex = ID): Promise<void> => {
  const start = await centerOf(rowHandle(page, row, layoutIndex));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, start.y + dy / 2, { steps: 4 });
  await page.mouse.move(start.x, start.y + dy, { steps: 4 });
};

/** Per mounted cell of a row: its bottom minus its row handle's bottom, `null` without one. */
const rowEdgeGaps = (page: Page, row: number): Promise<{ col: number; gap: number | null }[]> =>
  grid(page).evaluate((root, index) =>
    Array.from(root.querySelectorAll<HTMLElement>(`[data-cell-row="${index}"]`)).map((node) => {
      const handle = node.querySelector(".gp-grid-row-resize-handle");
      const bottom = node.getBoundingClientRect().bottom;
      return { col: Number(node.dataset.cellCol), gap: handle === null ? null : bottom - handle.getBoundingClientRect().bottom };
    }), row);

/** The topmost element at a point carries `className`. */
const isOnTop = (page: Page, point: { x: number; y: number }, className: string): Promise<boolean> =>
  page.evaluate(({ x, y, name }) => document.elementFromPoint(x, y)?.classList.contains(name) ?? false,
    { ...point, name: className });

/** Wait until the core height of a row is `height`, within the tolerance. */
const waitForNearHeight = (page: Page, row: number, height: number): Promise<void> =>
  expect.poll(async () => Math.abs((await rowHeightAt(page, row)) - height))
    .toBeLessThanOrEqual(TOLERANCE);

test("AC-007-01 a row edge drag shows the line and adds its distance on release", async ({ page }, testInfo) => {
  const pageErrors = await armAutoFit(page, testInfo.project.name);
  await resetEventCounts(page);
  const row = 2;
  const rowBox = await cell(page, row, NAME).boundingBox();
  if (rowBox === null) throw new Error("Row cell is not measurable.");

  await pressRowEdge(page, row, DRAG);

  // The preview edge sits where the row will end; nothing commits before release.
  await expect(rowResizeLine(page)).toHaveCount(1);
  const line = await rowResizeLine(page).boundingBox();
  expect(Math.abs(line!.y - (rowBox.y + ROW_HEIGHT + DRAG))).toBeLessThanOrEqual(TOLERANCE);
  expect(await rowHeightAt(page, row)).toBe(ROW_HEIGHT);
  await expect(rowHandle(page, row)).toHaveClass(/gp-grid-row-resize-handle--active/);

  await page.mouse.up();

  await waitForHeight(page, row, ROW_HEIGHT + DRAG);
  await expect(rowResizeLine(page)).toHaveCount(0);
  expect((await fitEventCounts(page)).rowResized).toBe(1);
  expect(await rowHeightOverrides(page)).toEqual([{ rowId: row, height: ROW_HEIGHT + DRAG }]);
  await expect.poll(async () => (await boxAt(page, row))?.height).toBe(ROW_HEIGHT + DRAG);
  await expectContiguousRows(page);
  expect(pageErrors).toEqual([]);
});

test("AC-007-01 a frozen row edge drag grows the band and keeps the suffix below it", async ({ page }, testInfo) => {
  const pageErrors = await armAutoFit(page, testInfo.project.name);
  await page.getByTestId("freeze-two").click();
  await expect.poll(async () => (await rowRegions(page))?.frozenExtent).toBe(2 * ROW_HEIGHT);
  await resetEventCounts(page);

  await pressRowEdge(page, 0, DRAG);
  await page.mouse.up();

  await waitForHeight(page, 0, ROW_HEIGHT + DRAG);
  await expect.poll(async () => (await rowRegions(page))?.frozenExtent).toBe(2 * ROW_HEIGHT + DRAG);
  expect((await fitEventCounts(page)).rowResized).toBe(1);
  const rows = await expectContiguousRows(page);
  const firstSuffix = rows.find((row) => row.frozen === false);
  expect(firstSuffix?.row).toBe(2);
  expect(Math.abs(firstSuffix!.top - (2 * ROW_HEIGHT + DRAG))).toBeLessThanOrEqual(TOLERANCE);
  expect(pageErrors).toEqual([]);
});

test("AC-007-01 Alt+Arrow steps the active cell's row and column", async ({ page }, testInfo) => {
  const pageErrors = await armAutoFit(page, testInfo.project.name);
  await cell(page, 1, NAME).click();
  await expect.poll(() => activeCell(page)).toEqual({ row: 1, col: NAME });
  await resetEventCounts(page);

  await page.keyboard.press("Alt+ArrowDown");
  await page.keyboard.press("Alt+ArrowDown");
  await waitForHeight(page, 1, ROW_HEIGHT + 8);

  await page.keyboard.press("Alt+ArrowRight");
  await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(() => layoutWidth(page, "name")).toBe(136);
  await waitForColumnWidth(page, NAME, 136);

  // One event per step, and the keys never moved the active cell.
  const counts = await fitEventCounts(page);
  expect(counts.rowResized).toBe(2);
  expect(counts.resized).toBe(2);
  expect(await activeCell(page)).toEqual({ row: 1, col: NAME });
  await expect.poll(async () => (await boxAt(page, 1))?.height).toBe(ROW_HEIGHT + 8);
  await expectContiguousRows(page);
  expect(pageErrors).toEqual([]);
});

test("AC-007-01 a click on either handle fires nothing", async ({ page }, testInfo) => {
  const pageErrors = await armAutoFit(page, testInfo.project.name);
  await resetEventCounts(page);
  const widths = await Promise.all(COLUMN_IDS.map((id) => layoutWidth(page, id)));

  const column = await centerOf(columnHandle(page, NAME));
  await page.mouse.click(column.x, column.y);
  const row = await centerOf(rowHandle(page, 1));
  await page.mouse.click(row.x, row.y);
  await nextFrames(page);

  expect(await fitEventCounts(page)).toEqual({ resized: 0, moved: 0, dragged: 0, pinned: 0, rowResized: 0 });
  expect(await rowHeightOverrides(page)).toEqual([]);
  expect((await columnState(page)).filter((entry) => entry.width !== undefined)).toEqual([]);
  expect(await Promise.all(COLUMN_IDS.map((id) => layoutWidth(page, id)))).toEqual(widths);
  expect(await rowHeightAt(page, 1)).toBe(ROW_HEIGHT);
  // The press stopped at the handle, so no cell was selected through it.
  expect(await activeCell(page)).toBeNull();
  expect(pageErrors).toEqual([]);
});

test("AC-007-01 the row edge follows the row from a center cell and from the end pin", async ({ page }, testInfo) => {
  const pageErrors = await armAutoFit(page, testInfo.project.name);
  await resetEventCounts(page);
  const row = 2;
  const rowCells = page.locator(`[data-cell-row="${row}"]`);

  for (const [step, layoutIndex] of [NAME, SUMMARY].entries()) {
    await pressRowEdge(page, row, DRAG, layoutIndex);
    // Every cell of the dragged row shows the edge as active, and no other row does.
    const active = page.locator(".gp-grid-row-resize-handle--active");
    await expect(active).toHaveCount(await rowCells.count());
    await expect(rowCells.locator(".gp-grid-row-resize-handle--active")).toHaveCount(await rowCells.count());
    await page.mouse.up();
    await waitForHeight(page, row, ROW_HEIGHT + (step + 1) * DRAG);
  }

  expect((await fitEventCounts(page)).rowResized).toBe(2);
  expect(await rowHeightOverrides(page)).toEqual([{ rowId: row, height: ROW_HEIGHT + 2 * DRAG }]);
  await expect.poll(async () => (await boxAt(page, row))?.height).toBe(ROW_HEIGHT + 2 * DRAG);
  const gaps = await rowEdgeGaps(page, row);
  expect(gaps.map((entry) => entry.col)).toEqual(expect.arrayContaining([ID, NAME, SUMMARY]));
  for (const { col, gap } of gaps) {
    expect(gap, `row ${row} col ${col} handle on the row edge`).not.toBeNull();
    expect(Math.abs(gap!), `row ${row} col ${col} handle on the row edge`).toBeLessThanOrEqual(TOLERANCE);
  }
  await expectContiguousRows(page);
  expect(pageErrors).toEqual([]);
});

test("AC-007-01 the fill handle stacks above the row edge and a fill drag still fills", async ({ page }, testInfo) => {
  const pageErrors = await armAutoFit(page, testInfo.project.name);
  await cell(page, 1, NAME).click();
  const fill = page.locator(".gp-grid-fill-handle");
  await expect(fill).toHaveCount(1);
  const handleBox = await fill.boundingBox();
  const edge = await rowHandle(page, 1, NAME).boundingBox();
  if (handleBox === null || edge === null) throw new Error("Handles are not measurable.");
  // Press where the fill handle overlaps the active cell's row edge.
  const top = Math.max(handleBox.y, edge.y);
  const bottom = Math.min(handleBox.y + handleBox.height, edge.y + edge.height);
  expect(bottom - top).toBeGreaterThan(1);
  const start = { x: handleBox.x + handleBox.width / 2, y: (top + bottom) / 2 };
  expect(await isOnTop(page, start, "gp-grid-fill-handle")).toBe(true);
  await resetEventCounts(page);

  const target = await centerOf(cell(page, 3, NAME));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, target.y, { steps: 6 });
  await page.mouse.up();

  await expect(cell(page, 2, NAME)).toHaveText("Row 001");
  await expect(cell(page, 3, NAME)).toHaveText("Row 001");
  await expect(rowResizeLine(page)).toHaveCount(0);
  expect((await fitEventCounts(page)).rowResized).toBe(0);
  expect(await rowHeightOverrides(page)).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("AC-007-03 a column edge double-click fits c0 to its widest mounted content", async ({ page }, testInfo) => {
  const pageErrors = await armAutoFit(page, testInfo.project.name);
  // c0's edge sits under the end pin until the center scrolls.
  await waitForScroll(page, 0, 200);
  await resetEventCounts(page);
  const sample = await sampleIntrinsic(page);
  const expected = clamp(Math.ceil(widestInColumn(sample, C0)), MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH);
  expect(expected).not.toBe(120);

  const edge = await centerOf(columnHandle(page, C0));
  await page.mouse.dblclick(edge.x, edge.y);

  await expect.poll(() => layoutWidth(page, "c0")).toBe(expected);
  await waitForColumnWidth(page, C0, expected);
  const state = (await columnState(page)).find((entry) => entry.columnId === "c0");
  expect(state?.width).toBe(expected);
  expect((await fitEventCounts(page)).resized).toBe(1);

  // `width: null` drops the override and restores the declared width.
  await setColumnWidth(page, "c0", null);
  await expect.poll(() => layoutWidth(page, "c0")).toBe(120);
  const reset = (await columnState(page)).find((entry) => entry.columnId === "c0");
  expect(reset?.width).toBeUndefined();
  await waitForColumnWidth(page, C0, 120);
  expect(pageErrors).toEqual([]);
});

test("AC-007-03 a row edge double-click fits the row to its tallest cell", async ({ page }, testInfo) => {
  const pageErrors = await armAutoFit(page, testInfo.project.name);
  await resetEventCounts(page);
  // Row 4 carries the longest notes, so its wrapped cell is the tallest.
  const row = 4;
  const sample = await sampleIntrinsic(page);
  const expected = clamp(tallestInRow(sample, row), ROW_HEIGHT, MAX_ROW_HEIGHT);
  expect(expected).toBeGreaterThan(ROW_HEIGHT + TOLERANCE);

  const edge = await centerOf(rowHandle(page, row));
  await page.mouse.dblclick(edge.x, edge.y);

  await waitForNearHeight(page, row, expected);
  const overrides = await rowHeightOverrides(page);
  expect(overrides.map((entry) => entry.rowId)).toEqual([row]);
  expect(Math.abs(overrides[0]!.height - expected)).toBeLessThanOrEqual(TOLERANCE);
  expect((await fitEventCounts(page)).rowResized).toBe(1);
  await expect.poll(async () => Math.abs(((await boxAt(page, row))?.height ?? 0) - expected))
    .toBeLessThanOrEqual(TOLERANCE);
  // The double-click stopped at the handle: no peek and no selection.
  await expect(page.locator(".gp-grid-cell-peek")).toHaveCount(0);
  expect(await activeCell(page)).toBeNull();
  await expectContiguousRows(page);

  await page.getByTestId("reset-row-heights").click();
  await expect.poll(() => rowHeightOverrides(page)).toEqual([]);
  expect(await rowHeightAt(page, row)).toBe(ROW_HEIGHT);
  await expect.poll(async () => (await boxAt(page, row))?.height).toBe(ROW_HEIGHT);
  expect(pageErrors).toEqual([]);
});

test("AC-007-03 a body double-click beside the row handle still opens the peek", async ({ page }, testInfo) => {
  const pageErrors = await armAutoFit(page, testInfo.project.name);
  await resetEventCounts(page);

  await cell(page, 5, 0).dblclick();

  await expect(page.locator(".gp-grid-cell-peek")).toHaveCount(1);
  expect(await rowHeightAt(page, 5)).toBe(ROW_HEIGHT);
  expect(await rowHeightOverrides(page)).toEqual([]);
  expect((await fitEventCounts(page)).rowResized).toBe(0);
  expect(pageErrors).toEqual([]);
});

test("AC-007-04 a named column fit reports the rendered scope, the mounted rows and the maximum", async ({ page }, testInfo) => {
  const pageErrors = await armAutoFit(page, testInfo.project.name);
  const mounted = mountedRowCount(await sampleIntrinsic(page), NAME);
  expect(mounted).toBeGreaterThan(0);

  const result = await fitColumns(page, ["name"]);

  expect(result).toEqual({
    status: "applied",
    scope: "rendered",
    consideredRows: mounted,
    columns: [{ columnId: "name", width: NAME_MAX_WIDTH, clamped: "max" }],
    skipped: [],
  });
  expect(await lastFitResult(page)).toEqual(result);
  await waitForColumnWidth(page, NAME, NAME_MAX_WIDTH);
  expect(pageErrors).toEqual([]);
});

test("AC-007-04 fits on the paged arm request nothing", async ({ page }, testInfo) => {
  const pageErrors = await armAutoFit(page, testInfo.project.name, "paged");
  await expect.poll(async () => (await requestedRanges(page)).length).toBeGreaterThan(0);
  await nextFrames(page);
  const before = await requestedRanges(page);

  const columns = await fitColumns(page);
  expect(columns.status).toBe("applied");
  const notes = columns.columns.find((entry) => entry.columnId === "notes");
  await waitForColumnWidth(page, NOTES, notes!.width);
  const rows = await fitRows(page);
  expect(rows.status).toBe("applied");
  await waitForNearHeight(page, rows.rows.at(-1)!.rowId as number, rows.rows.at(-1)!.height);
  await nextFrames(page);

  expect(await requestedRanges(page)).toEqual(before);
  expect(pageErrors).toEqual([]);
});

test("AC-007-05 fitting the row above the first visible one keeps that row's box top", async ({ page }, testInfo) => {
  const pageErrors = await armAutoFit(page, testInfo.project.name);
  await waitForScroll(page, SCROLL_TOP, 0);
  const anchor = await firstVisibleRow(page);
  const anchorBox = await boxAt(page, anchor);
  const scrollTop = (await bodyMetrics(page)).scrollTop;

  const result = await fitRows(page, [anchor - 1]);

  expect(result.status).toBe("applied");
  const growth = result.rows[0]!.height - ROW_HEIGHT;
  expect(growth).toBeGreaterThan(TOLERANCE);
  await expect.poll(async () => Math.abs((await bodyMetrics(page)).scrollTop - scrollTop - growth))
    .toBeLessThanOrEqual(TOLERANCE);
  const after = await boxAt(page, anchor);
  expect(Math.abs(after!.top - anchorBox!.top)).toBeLessThanOrEqual(TOLERANCE);
  await expectContiguousRows(page);
  expect(pageErrors).toEqual([]);
});

test("AC-007-05 fitting a frozen row grows the band and keeps the first suffix row below it", async ({ page }, testInfo) => {
  const pageErrors = await armAutoFit(page, testInfo.project.name);
  await waitForScroll(page, SCROLL_TOP, 0);
  await page.getByTestId("freeze-two").click();
  await expect.poll(async () => (await rowRegions(page))?.frozenExtent).toBe(2 * ROW_HEIGHT);
  const firstSuffix = async () => {
    const extent = (await rowRegions(page))?.frozenExtent ?? 0;
    const suffix = (await cellBoxes(page)).filter((box) => box.frozen === false);
    const under = suffix.filter((box) => box.top + box.height > extent + TOLERANCE);
    const first = under.reduce((a, b) => (b.row < a.row ? b : a));
    return { row: first.row, offset: first.top - extent };
  };
  const before = await firstSuffix();

  // Row 1's notes wrap past one line, so the fit grows the band.
  const result = await fitRows(page, [1]);

  expect(result.status).toBe("applied");
  const extent = ROW_HEIGHT + result.rows[0]!.height;
  await expect.poll(async () => Math.abs(((await rowRegions(page))?.frozenExtent ?? 0) - extent))
    .toBeLessThanOrEqual(TOLERANCE);
  expect((await rowRegions(page))?.frozenCount).toBe(2);
  await expect.poll(async () => (await firstSuffix()).row).toBe(before.row);
  expect(Math.abs((await firstSuffix()).offset - before.offset)).toBeLessThanOrEqual(TOLERANCE);
  await expectContiguousRows(page);
  expect(pageErrors).toEqual([]);
});

test("AC-007-06 a fit leaves every cell's style attribute as it was", async ({ page }, testInfo) => {
  const pageErrors = await armAutoFit(page, testInfo.project.name);
  // Both stay mounted once they widen, so their renders can be awaited.
  const columns = ["name", "notes"];
  const rows = [0, 1, 2, 3, 4];
  // First fits change sizes; once rendered, a repeated fit measures and changes nothing.
  const applied = await fitColumns(page, columns);
  for (const entry of applied.columns) {
    await waitForColumnWidth(page, layoutIndexOf(entry.columnId), entry.width);
  }
  const fitted = await fitRows(page, rows);
  for (const entry of fitted.rows) await waitForNearHeight(page, entry.rowId as number, entry.height);
  await nextFrames(page);

  const snapshot = await stylesAroundFits(page, { columns, rows });

  expect(snapshot.statuses).toEqual(["unchanged", "unchanged"]);
  expect(Object.keys(snapshot.before).length).toBeGreaterThan(rows.length);
  expect(snapshot.after).toEqual(snapshot.before);
  await nextFrames(page);
  expect((await stylesAroundFits(page)).before).toEqual(snapshot.before);
  expect(pageErrors).toEqual([]);
});

test("AC-007-06 five remounts return to the first mount's node count", async ({ page }, testInfo) => {
  const pageErrors = await armAutoFit(page, testInfo.project.name);
  const first = await settledNodeCount(page);

  for (let remount = 0; remount < 5; remount += 1) {
    expect((await fitColumns(page)).status).toBe("applied");
    const previous = await generation(page);
    await page.getByTestId("remount").click();
    await expect.poll(() => generation(page)).toBeGreaterThan(previous);
    await expect(cell(page, 0, NOTES)).toContainText("lorem ipsum");
  }

  await expect.poll(() => settledNodeCount(page)).toBe(first);
  expect(pageErrors).toEqual([]);
});

test("AC-007-07 Alt+Enter and Alt+Shift+Enter fit the active cell's column and row without a pointer", async ({ page }, testInfo) => {
  const pageErrors = await armAutoFit(page, testInfo.project.name);
  await resetEventCounts(page);
  await grid(page).focus();
  await activateCell(page, 3, NAME);
  await expect.poll(() => activeCell(page)).toEqual({ row: 3, col: NAME });

  await page.keyboard.press("Alt+Enter");

  await expect.poll(() => layoutWidth(page, "name")).toBe(NAME_MAX_WIDTH);
  await waitForColumnWidth(page, NAME, NAME_MAX_WIDTH);
  expect((await fitEventCounts(page)).resized).toBe(1);

  const expected = clamp(tallestInRow(await sampleIntrinsic(page), 3), ROW_HEIGHT, MAX_ROW_HEIGHT);
  expect(expected).toBeGreaterThan(ROW_HEIGHT + TOLERANCE);
  await page.keyboard.press("Alt+Shift+Enter");

  await waitForNearHeight(page, 3, expected);
  const counts = await fitEventCounts(page);
  expect(counts.rowResized).toBe(1);
  expect(counts.resized).toBe(1);
  expect(await activeCell(page)).toEqual({ row: 3, col: NAME });
  await expect(grid(page)).toBeFocused();
  expect(pageErrors).toEqual([]);
});

test("AC-007-07 Tab never lands on a handle", async ({ page }, testInfo) => {
  const pageErrors = await armAutoFit(page, testInfo.project.name);
  const handles = page.locator(".gp-grid-header-resize-handle, .gp-grid-row-resize-handle");
  expect(await handles.count()).toBeGreaterThan(0);
  await expect(page.locator(
    ".gp-grid-header-resize-handle:not([aria-hidden='true']), .gp-grid-row-resize-handle:not([aria-hidden='true'])",
  )).toHaveCount(0);
  await expect(page.locator(
    ".gp-grid-header-resize-handle[tabindex], .gp-grid-row-resize-handle[tabindex]",
  )).toHaveCount(0);

  // From the last control, Tab enters the grid at its single stop; inside,
  // the grid keeps Tab for the active cell.
  await page.locator("[data-conformance-framework] > div:first-of-type > button").last().focus();
  const trail: string[] = [];
  for (const key of ["Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab"]) {
    await page.keyboard.press(key);
    trail.push(await focusedClass(page));
  }

  expect(trail[0]).toContain("gp-grid-container");
  expect(trail.filter((entry) => entry.includes("resize-handle"))).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("AC-007-11 Alt+Shift+ArrowRight moves the active cell's column and the cell follows", async ({ page }, testInfo) => {
  const pageErrors = await armAutoFit(page, testInfo.project.name);
  await cell(page, 0, NAME).click();
  await expect.poll(() => activeCell(page)).toEqual({ row: 0, col: NAME });
  await resetEventCounts(page);

  await page.keyboard.press("Alt+Shift+ArrowRight");

  await expect.poll(() => columnIds(page)).toEqual([
    "id", "notes", "name", "c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "summary",
  ]);
  await expect.poll(() => activeCell(page)).toEqual({ row: 0, col: NAME + 1 });
  const active = page.locator(".gp-grid-cell--active");
  await expect(active).toHaveCount(1);
  await expect(active).toHaveAttribute("data-cell-col", String(NAME + 1));
  await expect(active).toHaveText("Row 000");
  expect((await fitEventCounts(page)).moved).toBe(1);
  expect(pageErrors).toEqual([]);
});
