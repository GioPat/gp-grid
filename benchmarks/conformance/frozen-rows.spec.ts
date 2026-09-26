// benchmarks/conformance/frozen-rows.spec.ts
// AC-005-02/03: the band's geometry through vertical scroll, the uncompressed
// frozen rows, both horizontal extremes, the frozen x pinned intersections and
// the C13 live region. Runs in the react, vue and angular projects.

import { expect, test } from "@playwright/test";
import {
  activeCell,
  announcement,
  armFreezeRows,
  BLOCK_HEIGHT,
  blockBox,
  bodyMetrics,
  CONTENT_WIDTH,
  expectFrozenBand,
  expectRowsOnGrid,
  expectSuffixCoversClip,
  expectSuffixRowGrid,
  FROZEN_COUNT,
  frozenBlock,
  frozenCell,
  frozenPinBox,
  frozenPinLayer,
  frozenRows,
  gridPinBox,
  hitsInside,
  mountedRows,
  ROW_HEIGHT,
  rowRegions,
  SAMPLE_ROW_COUNT,
  scroller,
  waitForScroll,
} from "./frozen-rows-helpers";
import { gridAria, headerControlTokens } from "./frozen-rows-runtime-helpers";
import { openFixture, TOLERANCE } from "./helpers";

/** The fixture's 8 x 100 px columns, all displayed. */
const DISPLAYED_COLUMNS = 8;

test("keeps the block under the header through vertical scroll", async ({ page }, testInfo) => {
  const pageErrors = await armFreezeRows(page, testInfo.project.name);
  const start = await bodyMetrics(page);
  // 1,000,000 rows at 32 px are compressed far below their 32,000,000 px extent.
  expect(start.scrollHeight).toBeGreaterThan(1_000_000);
  expect(start.scrollHeight).toBeLessThan(SAMPLE_ROW_COUNT * ROW_HEIGHT);

  const samples = [0, Math.floor(start.maxScroll / 2), start.maxScroll - 200, 0];
  for (const top of samples) {
    await waitForScroll(page, top, 0);
    const block = await blockBox(page);
    expect(Math.abs(block.top), `block top at ${top}`).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(block.height - BLOCK_HEIGHT), `block height at ${top}`).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(block.width - CONTENT_WIDTH), `block width at ${top}`).toBeLessThanOrEqual(TOLERANCE);

    const rows = await mountedRows(page);
    expectFrozenBand(rows);
    expectSuffixRowGrid(rows);
    expectRowsOnGrid(rows);
    expectSuffixCoversClip(rows, (await bodyMetrics(page)).clientHeight);

    // The block paints above the wrapper: a point inside the band resolves to
    // the block, never to the suffix rows scrolling underneath it.
    const pageBox = await frozenBlock(page).boundingBox();
    if (pageBox === null) throw new Error("Frozen block is not measurable.");
    const painted = await hitsInside(
      page,
      { x: pageBox.x + 300, y: pageBox.y + BLOCK_HEIGHT / 2 },
      ".gp-grid-frozen-rows",
    );
    expect(painted, `band paint order at ${top}`).toBe(true);
  }

  await expect.poll(async () => (await rowRegions(page))?.frozenCount ?? 0).toBe(FROZEN_COUNT);
  expect(pageErrors).toEqual([]);
});

test("keeps the frozen pins on the grid's own pin boxes at both horizontal extremes", async ({ page }, testInfo) => {
  const pageErrors = await armFreezeRows(page, testInfo.project.name);
  const metrics = await bodyMetrics(page);
  expect(metrics.maxScrollLeft).toBeGreaterThan(0);

  await waitForScroll(page, 0, 0);
  const startBefore = await frozenPinBox(page, "start");
  const frozenCenterBefore = await frozenCell(page, 0, 3).boundingBox();
  if (frozenCenterBefore === null) throw new Error("Frozen center cell is not measurable.");

  for (const left of [0, metrics.maxScrollLeft]) {
    await waitForScroll(page, 0, left);
    for (const region of ["start", "end"] as const) {
      const reference = await gridPinBox(page, region);
      const frozen = await frozenPinBox(page, region);
      expect(Math.abs(frozen.x - reference.x), `${region} pin x at ${left}`).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(frozen.width - reference.width), `${region} pin width at ${left}`)
        .toBeLessThanOrEqual(TOLERANCE);
    }
  }

  // The frozen center cells scroll with the content while the pins stay put.
  const frozenCenterAfter = await frozenCell(page, 0, 3).boundingBox();
  if (frozenCenterAfter === null) throw new Error("Frozen center cell is not measurable.");
  expect(Math.abs(frozenCenterBefore.x - metrics.maxScrollLeft - frozenCenterAfter.x))
    .toBeLessThanOrEqual(TOLERANCE);
  const startAfter = await frozenPinBox(page, "start");
  expect(Math.abs(startAfter.x - startBefore.x)).toBeLessThanOrEqual(TOLERANCE);
  expect(pageErrors).toEqual([]);
});

test("aligns the frozen pins with the frozen rows through vertical scroll", async ({ page }, testInfo) => {
  const pageErrors = await armFreezeRows(page, testInfo.project.name);
  for (const top of [0, ROW_HEIGHT, BLOCK_HEIGHT + ROW_HEIGHT]) {
    await waitForScroll(page, top, 0);
    const center = await frozenBlock(page).boundingBox();
    if (center === null) throw new Error("Frozen block is not measurable.");
    for (const region of ["start", "end"] as const) {
      const pin = await frozenPinBox(page, region);
      expect(Math.abs(pin.y - center.y), `${region} pin y at ${top}`).toBeLessThanOrEqual(TOLERANCE);
    }
  }
  const pinBackgrounds = await frozenPinLayer(page).locator(".gp-grid-pin").evaluateAll((pins) =>
    pins.map((pin) => getComputedStyle(pin).backgroundColor));
  expect(pinBackgrounds.length).toBeGreaterThan(0);
  expect(pinBackgrounds, "frozen pins hide the center cells beneath them")
    .not.toContain("rgba(0, 0, 0, 0)");
  expect(pageErrors).toEqual([]);
});

test("renders one element per frozen and pinned intersection", async ({ page }, testInfo) => {
  const pageErrors = await armFreezeRows(page, testInfo.project.name);
  await expect(frozenPinLayer(page)).toHaveCount(1);
  // The block carries center cells only; every pin lives in the sibling layer.
  await expect(page.locator(".gp-grid-frozen-rows .gp-grid-pin")).toHaveCount(0);
  await expect(page.locator(".gp-grid-frozen-pins .gp-grid-frozen-pin-row")).toHaveCount(FROZEN_COUNT);

  for (let row = 0; row < FROZEN_COUNT; row += 1) {
    for (const column of [0, 1, 4, 7]) {
      await expect(frozenCell(page, row, column), `row ${row} column ${column}`).toHaveCount(1);
    }
    // One semantic row per frozen row: the pin layer is presentational only.
    await expect(
      page.locator(`.gp-grid-frozen-rows [aria-rowindex="${row + 1}"][role="row"]`),
    ).toHaveCount(1);
  }

  await frozenCell(page, 1, 0).click();
  await expect.poll(async () => activeCell(page)).toEqual({ row: 1, col: 0 });
  await expect(page.locator(".gp-grid-cell--active")).toHaveCount(1);

  // A frozen center cell under the pin layer's transparent middle stays
  // clickable and selects the block's own cell.
  await waitForScroll(page, 0, 120);
  const center = await frozenCell(page, 2, 4).boundingBox();
  if (center === null) throw new Error("Frozen center cell is not measurable.");
  const point = { x: center.x + center.width / 2, y: center.y + center.height / 2 };
  expect(await hitsInside(page, point, ".gp-grid-pin")).toBe(false);
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => activeCell(page)).toEqual({ row: 2, col: 4 });
  await expect(page.locator(".gp-grid-cell--active")).toHaveCount(1);
  expect(pageErrors).toEqual([]);
});

test("announces the cache-limited count under the tight variant", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await page.getByTestId("use-frozen-paged-tight").click();

  await expect.poll(async () => frozenRows(page)).toMatchObject({
    requestedCount: FROZEN_COUNT,
    effectiveCount: 0,
    limit: "cache",
  });
  await expect(page.locator(".gp-grid-frozen-rows")).toHaveCount(0);
  await expect(page.locator(".gp-grid-frozen-pins")).toHaveCount(0);

  const live = page.locator('[role="status"]');
  await expect(live).toHaveCount(1);
  await expect(live).toHaveText("0 of 3 rows frozen");
  await expect.poll(async () => (await announcement(page))?.message).toBe("0 of 3 rows frozen");
  // The suffix keeps the flat window and its first page.
  await expect(page.locator('[data-cell-row="0"][data-cell-col="1"]')).toHaveText("1");
  await expect.poll(async () => (await rowRegions(page))?.frozenCount ?? -1).toBe(0);
  expect(pageErrors).toEqual([]);
});

test("restores the flat DOM when the freeze is cleared", async ({ page }, testInfo) => {
  const pageErrors = await armFreezeRows(page, testInfo.project.name);
  await expect(page.locator(".gp-grid-frozen-rows")).toHaveCount(1);

  await page.getByTestId("clear-freeze-rows").click();
  await expect(page.locator(".gp-grid-frozen-rows")).toHaveCount(0);
  await expect(page.locator(".gp-grid-frozen-pins")).toHaveCount(0);
  await expect(scroller(page).locator(".gp-grid-rows-wrapper")).toHaveCount(1);
  await expect(page.locator('[data-cell-row="0"][data-cell-col="1"]')).toContainText("Row 000");
  await expect.poll(async () => (await rowRegions(page))?.frozenCount ?? -1).toBe(0);
  await expect.poll(async () => (await frozenRows(page))?.requestedCount ?? -1).toBe(0);
  expect(pageErrors).toEqual([]);
});

test("keeps an unarmed fixture free of frozen DOM", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await expect(page.locator(".gp-grid-frozen-rows")).toHaveCount(0);
  await expect(page.locator(".gp-grid-frozen-pins")).toHaveCount(0);
  await expect(scroller(page).locator(".gp-grid-rows-wrapper")).toHaveCount(1);
  await page.getByTestId("use-columnar").click();
  await expect.poll(async () => (await rowRegions(page))?.frozenCount ?? -1).toBe(0);
  await expect(page.locator(".gp-grid-frozen-rows")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("qualifies the band's ARIA surface and ships no freeze control", async ({ page }, testInfo) => {
  const pageErrors = await armFreezeRows(page, testInfo.project.name);
  await expect.poll(async () => (await gridAria(page)).colCount).toBe(DISPLAYED_COLUMNS);
  await expect.poll(async () => (await gridAria(page)).rowCount).toBe(SAMPLE_ROW_COUNT);
  const aria = await gridAria(page);
  expect(aria.role, "the grid role").toBe("grid");

  // One semantic row per frozen logical row, 1-based, and never a second one
  // in the presentational pin layer.
  for (let row = 0; row < FROZEN_COUNT; row += 1) {
    expect(aria.rows.find((group) => group.rowIndex === row + 1), `frozen row ${row}`)
      .toEqual({ rowIndex: row + 1, elements: 1, pinned: 0 });

    const cells = aria.cells.filter((cell) => cell.rowIndex === row);
    expect(cells.length, `frozen row ${row} cells`).toBeGreaterThan(0);
    expect(new Set(cells.map((cell) => cell.colIndex)).size, `frozen row ${row} duplicate cells`)
      .toBe(cells.length);
    for (const cell of cells) {
      expect(cell.colIndex, `row ${row} displayed column ${cell.displayedIndex}`)
        .toBe(cell.displayedIndex + 1);
      if (cell.pinned) {
        expect(["start", "end"], `row ${row} pinned column ${cell.colIndex}`).toContain(cell.region);
      } else {
        expect(cell.region, `row ${row} center column ${cell.colIndex}`).toBe("center");
      }
    }
    // The fixture pins `c0` start and `c7` end: one pinned cell per frozen row.
    expect(cells.filter((cell) => cell.pinned).map((cell) => cell.colIndex), `frozen row ${row} pins`)
      .toEqual([1, aria.colCount]);
    expect(cells.some((cell) => cell.pinned === false), `frozen row ${row} center cells`).toBe(true);
  }
  expect(aria.pinLayerRows, "semantic rows in the pin layer").toBe(0);

  // The suffix continues the same sequence and renders the same column window,
  // so the band's split adds no semantic divergence from the shipped pattern.
  const suffix = aria.rows
    .filter((group) => group.rowIndex > FROZEN_COUNT)
    .sort((left, right) => left.rowIndex - right.rowIndex);
  expect(suffix.length, "mounted suffix rows").toBeGreaterThan(0);
  for (const [offset, group] of suffix.entries()) {
    expect(group.rowIndex, `suffix row ${offset}`).toBe(FROZEN_COUNT + 1 + offset);
  }
  const columnsOf = (rowIndex: number): number[] =>
    aria.cells.filter((cell) => cell.rowIndex === rowIndex)
      .map((cell) => cell.colIndex)
      .sort((left, right) => left - right);
  expect(columnsOf(0), "the band renders the suffix row's columns")
    .toEqual(columnsOf(suffix[0]!.rowIndex - 1));

  const live = page.locator('.gp-grid-visually-hidden[role="status"][aria-live="polite"]');
  await expect(live, "an unlimited prefix announces nothing").toHaveCount(0);

  await page.getByTestId("toggle-host-height").click();
  await expect.poll(async () => (await rowRegions(page))?.frozenCount ?? 0).toBe(1);
  await expect(live, "one polite live region").toHaveCount(1);
  await expect(live, "the limited count updates the live region")
    .toHaveText(`1 of ${FROZEN_COUNT} rows frozen`);

  // No visible freeze control: freeze text lives in the live region only, and
  // the header renders exactly the unarmed fixture's controls.
  const limited = await gridAria(page);
  expect(limited.visibleText, "the scan reads the grid's own text").toContain("C1");
  expect(limited.visibleText, "visible freeze text").not.toMatch(/frozen/i);
  const armedControls = await headerControlTokens(page);
  expect(armedControls.length, "the header has shipped controls").toBeGreaterThan(0);
  await openFixture(page, testInfo.project.name);
  const unarmedControls = await headerControlTokens(page);
  expect(unarmedControls.length, "the unarmed header has shipped controls").toBeGreaterThan(0);
  expect(armedControls, "the header renders the unarmed fixture's controls").toEqual(unarmedControls);
  expect(pageErrors).toEqual([]);
});
