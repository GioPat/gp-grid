// benchmarks/conformance/frozen-rows-boundary.spec.ts
// The frozen/suffix boundary for input (AC-005-06, C11): keyboard focus,
// editors on both sides, the synthetic touch swipe and the row-drag zone.
// Runs in the react, vue and angular projects.

import { expect, test, type Page } from "@playwright/test";
import {
  activeCell,
  armFreezeRows,
  BLOCK_HEIGHT,
  bodyMetrics,
  FROZEN_COUNT,
  frozenCell,
  mountedRows,
  rowRegions,
  scroller,
  waitForScroll,
} from "./frozen-rows-helpers";
import {
  dragOverBand,
  expectBand,
  firstSuffixIndex,
  relativeBox,
  swipeBand,
} from "./frozen-rows-runtime-helpers";
import { cell, openFixture, TOLERANCE } from "./helpers";

const OBJECT_TOP = 800;
const DRAG_ROW = 30;
const SUFFIX_ROW = 8;
const SCROLL_STEP = 128;

const armFrozenObject = async (page: Page, framework: string): Promise<Error[]> => {
  const pageErrors = await openFixture(page, framework);
  await page.getByTestId("use-frozen-object").click();
  await expect(page.locator(".gp-grid-frozen-rows")).toHaveCount(1);
  await expect.poll(async () => (await rowRegions(page))?.frozenCount ?? 0).toBe(FROZEN_COUNT);
  return pageErrors;
};

test("walks the active cell across the boundary with the arrow keys", async ({ page }, testInfo) => {
  const pageErrors = await armFrozenObject(page, testInfo.project.name);
  await frozenCell(page, 1, 1).click();
  await expect.poll(async () => activeCell(page)).toEqual({ row: 1, col: 1 });

  const steps = 12;
  for (let step = 0; step < steps; step += 1) {
    await page.keyboard.press("ArrowDown");
  }

  const deep = await activeCell(page);
  expect(deep!.row).toBeGreaterThan(FROZEN_COUNT);
  expect((await bodyMetrics(page)).scrollTop).toBeGreaterThan(0);
  // The band carries frozen rows only, so the walked-to suffix cell has to be
  // read with the unscoped locator.
  const deepBox = await relativeBox(page, cell(page, deep!.row, deep!.col));
  expect(deepBox.top, "active cell below the band").toBeGreaterThanOrEqual(
    BLOCK_HEIGHT - TOLERANCE,
  );

  for (let step = 0; step < steps; step += 1) {
    await page.keyboard.press("ArrowUp");
  }

  await expect.poll(async () => (await bodyMetrics(page)).scrollTop).toBe(0);
  const back = await activeCell(page);
  expect(back!.row).toBeLessThan(FROZEN_COUNT);
  const backBox = await relativeBox(page, frozenCell(page, back!.row, back!.col));
  expect(backBox.top, "active cell top inside the band").toBeGreaterThanOrEqual(-TOLERANCE);
  expect(backBox.bottom, "active cell bottom inside the band")
    .toBeLessThanOrEqual(BLOCK_HEIGHT + TOLERANCE);
  expect(pageErrors).toEqual([]);
});

test("keeps the band out of the tab order", async ({ page }, testInfo) => {
  const pageErrors = await armFrozenObject(page, testInfo.project.name);

  // The band and its pin layer add no tab stop, so focus never lands inside
  // them and Tab keeps the grid's shipped keyboard model.
  await expect(page.locator('.gp-grid-frozen-rows [tabindex]:not([tabindex="-1"])')).toHaveCount(0);
  await expect(page.locator('.gp-grid-frozen-pins [tabindex]:not([tabindex="-1"])')).toHaveCount(0);
  await frozenCell(page, 0, 1).click();
  await expect.poll(async () => activeCell(page)).toEqual({ row: 0, col: 1 });

  await page.keyboard.press("Tab");
  await expect.poll(async () => activeCell(page)).toEqual({ row: 0, col: 2 });
  const focusInBand = await page.evaluate(
    () => document.activeElement?.closest(".gp-grid-frozen-rows") !== null,
  );
  expect(focusInBand, "focus stays out of the band").toBe(false);
  expect(pageErrors).toEqual([]);
});

test("keeps editors on both sides of the boundary", async ({ page }, testInfo) => {
  const pageErrors = await armFrozenObject(page, testInfo.project.name);

  // A frozen editor keeps its draft and focus while the suffix scrolls under it.
  const frozenEditor = frozenCell(page, 1, 1);
  await frozenEditor.dblclick();
  const frozenInput = frozenEditor.locator(".gp-grid-edit-input");
  await frozenInput.fill("Frozen draft");
  await waitForScroll(page, 400, 0);
  await expect(frozenInput).toHaveValue("Frozen draft");
  await expect(frozenInput).toBeFocused();
  await frozenInput.press("Escape");
  await expect(page.locator(".gp-grid-edit-input")).toHaveCount(0);

  // A suffix editor follows its row and still commits with Enter.
  await waitForScroll(page, 0, 0);
  const suffixCell = page.locator(`[data-cell-row="${SUFFIX_ROW}"][data-cell-col="1"]`);
  await suffixCell.dblclick();
  const suffixInput = suffixCell.locator(".gp-grid-edit-input");
  await suffixInput.fill("Suffix draft");
  const before = await relativeBox(page, suffixInput);
  await waitForScroll(page, SCROLL_STEP, 0);
  const after = await relativeBox(page, suffixInput);
  expect(Math.abs(before.top - after.top - SCROLL_STEP), "editor follows its row")
    .toBeLessThanOrEqual(TOLERANCE);
  await expect(suffixInput).toBeFocused();
  await suffixInput.press("Enter");
  await expect(suffixCell).toContainText("Suffix draft");
  await expect(page.getByTestId("metrics")).toContainText('"editEvents":1');

  // Escape still cancels the next draft without a value change.
  const otherCell = page.locator(`[data-cell-row="${SUFFIX_ROW + 1}"][data-cell-col="1"]`);
  await otherCell.dblclick();
  const otherInput = otherCell.locator(".gp-grid-edit-input");
  await otherInput.fill("Cancelled draft");
  await otherInput.press("Escape");
  await expect(page.locator(".gp-grid-edit-input")).toHaveCount(0);
  await expect(otherCell).not.toContainText("Cancelled draft");
  await expect(page.getByTestId("metrics")).toContainText('"editEvents":1');
  expect(pageErrors).toEqual([]);
});

test("scrolls the suffix from a swipe started on the band", async ({ page }, testInfo) => {
  // The synthetic touch bridge only owns gestures while scroll compression is
  // active, so this case uses the compressed columnar arm.
  const pageErrors = await armFreezeRows(page, testInfo.project.name);
  await expect.poll(async () => scroller(page).evaluate((element) => element.style.touchAction))
    .toBe("none");
  const before = await bodyMetrics(page);

  await swipeBand(page, 120);

  await expect.poll(async () => (await bodyMetrics(page)).scrollTop)
    .toBeGreaterThan(before.scrollTop);
  await expectBand(page, FROZEN_COUNT);
  expect(firstSuffixIndex(await mountedRows(page))).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
});

test("auto-scrolls upward while a row drag hovers the band", async ({ page }, testInfo) => {
  const pageErrors = await armFrozenObject(page, testInfo.project.name);
  await waitForScroll(page, OBJECT_TOP, 0);

  const samples = await dragOverBand(page, DRAG_ROW, 600);

  const first = samples[0]!;
  expect(samples.at(-1)!, "pointer over the band scrolls up").toBeLessThan(first);
  for (const [index, sample] of samples.entries()) {
    if (index === 0) continue;
    expect(sample, `sample ${index} never scrolls down`).toBeLessThanOrEqual(samples[index - 1]!);
  }
  await expectBand(page, FROZEN_COUNT);
  expect(pageErrors).toEqual([]);
});
