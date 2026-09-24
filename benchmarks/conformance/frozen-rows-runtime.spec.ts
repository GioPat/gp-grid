// benchmarks/conformance/frozen-rows-runtime.spec.ts
// C12 runtime: in-place count changes without a remount, the suffix-anchor
// correction, the open-edit rule (AC-005-06) and the viewport-bounded prefix
// with its restore (AC-005-05). Runs in the react, vue and angular projects.

import { expect, test, type Page } from "@playwright/test";
import {
  announcement,
  BLOCK_HEIGHT,
  bodyMetrics,
  FROZEN_COUNT,
  frozenBlock,
  frozenCell,
  frozenRows,
  mountedRows,
  ROW_HEIGHT,
  rowRegions,
  scroller,
  setFreezeCount,
  waitForScroll,
  type RowBox,
} from "./frozen-rows-helpers";
import {
  expectBand,
  freezeEvents,
  rowTop,
  suffixOffsets,
} from "./frozen-rows-runtime-helpers";
import { coreToken, openFixture, TOLERANCE } from "./helpers";

const OBJECT_TOP = 800;
const ROW_FIVE = 5;

const armFrozenObject = async (page: Page, framework: string): Promise<Error[]> => {
  const pageErrors = await openFixture(page, framework);
  await page.getByTestId("use-frozen-object").click();
  await expect(frozenBlock(page)).toHaveCount(1);
  await expect.poll(async () => (await rowRegions(page))?.frozenCount ?? 0).toBe(FROZEN_COUNT);
  return pageErrors;
};

const expectFrozenCount = async (page: Page, count: number): Promise<void> => {
  await expect.poll(async () => (await rowRegions(page))?.frozenCount ?? 0).toBe(count);
};

test("changes the frozen prefix in place and anchors the suffix", async ({ page }, testInfo) => {
  const pageErrors = await armFrozenObject(page, testInfo.project.name);
  await waitForScroll(page, OBJECT_TOP, 0);
  const token = await coreToken(page);
  const beforeTop = (await bodyMetrics(page)).scrollTop;
  const before = suffixOffsets(await mountedRows(page), BLOCK_HEIGHT);
  const eventsBefore = (await freezeEvents(page)).length;
  const announcedBefore = await announcement(page);

  await page.getByTestId("freeze-count-5").click();

  await expectFrozenCount(page, 5);
  await expectBand(page, 5);
  // Unlimited before and after: the live region stays quiet.
  expect(await announcement(page)).toEqual(announcedBefore);
  // The option is reactive: the same core stays mounted.
  expect(await coreToken(page)).toBe(token);

  // C12: the block grows by two rows, the scroll top drops by the same extent
  // and every mounted suffix row keeps its offset below the bigger block.
  const afterTop = (await bodyMetrics(page)).scrollTop;
  expect(Math.abs(beforeTop - afterTop - 2 * ROW_HEIGHT), "scroll top drop")
    .toBeLessThanOrEqual(TOLERANCE);
  const after = suffixOffsets(await mountedRows(page), 5 * ROW_HEIGHT);
  const shared = [...before.keys()].filter((index) => after.has(index));
  expect(shared.length).toBeGreaterThan(0);
  for (const index of shared) {
    expect(Math.abs(after.get(index)! - before.get(index)!), `row ${index} offset`)
      .toBeLessThanOrEqual(TOLERANCE);
  }

  const events = (await freezeEvents(page)).slice(eventsBefore);
  expect(events.at(-1)).toEqual({ requestedCount: 5, effectiveCount: 5, limit: null });
  expect(pageErrors).toEqual([]);
});

test("freezes through view index five", async ({ page }, testInfo) => {
  const pageErrors = await armFrozenObject(page, testInfo.project.name);
  const eventsBefore = (await freezeEvents(page)).length;

  await page.getByTestId("freeze-through-5").click();

  await expectFrozenCount(page, ROW_FIVE + 1);
  await expectBand(page, ROW_FIVE + 1);
  await expect.poll(async () => (await frozenRows(page))?.requestedCount ?? 0).toBe(ROW_FIVE + 1);
  const events = (await freezeEvents(page)).slice(eventsBefore);
  expect(events.at(-1)).toEqual({
    requestedCount: ROW_FIVE + 1,
    effectiveCount: ROW_FIVE + 1,
    limit: null,
  });
  expect(pageErrors).toEqual([]);
});

test("unfreezes in place and restores the flat DOM", async ({ page }, testInfo) => {
  const pageErrors = await armFrozenObject(page, testInfo.project.name);
  const token = await coreToken(page);

  await page.getByTestId("unfreeze-in-place").click();

  await expect(frozenBlock(page)).toHaveCount(0);
  await expect(page.locator(".gp-grid-frozen-pins")).toHaveCount(0);
  await expect(scroller(page).locator(".gp-grid-rows-wrapper")).toHaveCount(1);
  await expect.poll(async () => (await frozenRows(page))?.requestedCount ?? -1).toBe(0);
  const flat: RowBox[] = await mountedRows(page);
  const top = rowTop(flat, 0);
  expect(top, "flat row 0 is mounted").toBeDefined();
  expect(Math.abs(top!), "flat row 0 at the top").toBeLessThanOrEqual(TOLERANCE);
  expect(await coreToken(page)).toBe(token);
  expect(pageErrors).toEqual([]);
});

test("commits a region-changing edit and keeps a frozen draft", async ({ page }, testInfo) => {
  const pageErrors = await armFrozenObject(page, testInfo.project.name);

  // An editor on a row that stays frozen survives the count change (C12).
  const frozenEditor = frozenCell(page, 1, 1);
  await frozenEditor.dblclick();
  const frozenInput = frozenEditor.locator(".gp-grid-edit-input");
  await frozenInput.fill("Frozen draft");
  await setFreezeCount(page, 5);
  await expectFrozenCount(page, 5);
  await expect(frozenInput).toHaveValue("Frozen draft");
  await expect(frozenInput).toBeFocused();
  await frozenInput.press("Escape");
  await expect(page.locator(".gp-grid-edit-input")).toHaveCount(0);

  // An editor whose row crosses into the band is committed by the freeze.
  const suffixCell = page.locator(`[data-cell-row="${ROW_FIVE}"][data-cell-col="1"]`);
  await suffixCell.dblclick();
  const suffixInput = suffixCell.locator(".gp-grid-edit-input");
  await suffixInput.fill("Committed row five");
  await setFreezeCount(page, ROW_FIVE + 1);

  await expectFrozenCount(page, ROW_FIVE + 1);
  await expect(frozenCell(page, ROW_FIVE, 1)).toHaveText("Committed row five");
  await expect(page.locator(".gp-grid-edit-input")).toHaveCount(0);
  await expect(page.getByTestId("metrics")).toContainText('"editEvents":1');
  expect(pageErrors).toEqual([]);
});

test("bounds the prefix by the viewport and restores it", async ({ page }, testInfo) => {
  const pageErrors = await armFrozenObject(page, testInfo.project.name);
  const eventsBefore = (await freezeEvents(page)).length;

  await page.getByTestId("toggle-host-height").click();

  await expect.poll(async () => frozenRows(page)).toMatchObject({
    requestedCount: FROZEN_COUNT,
    effectiveCount: 1,
    limit: "viewport",
  });
  await expectBand(page, 1);
  await expect(page.locator('[role="status"]')).toHaveText("1 of 3 rows frozen");
  await expect.poll(async () => (await announcement(page))?.message).toBe("1 of 3 rows frozen");
  const limited = (await freezeEvents(page)).slice(eventsBefore);
  expect(limited.at(-1)).toEqual({ requestedCount: FROZEN_COUNT, effectiveCount: 1, limit: "viewport" });

  await page.getByTestId("toggle-host-height").click();

  await expect.poll(async () => frozenRows(page)).toMatchObject({
    requestedCount: FROZEN_COUNT,
    effectiveCount: FROZEN_COUNT,
    limit: null,
  });
  await expectBand(page, FROZEN_COUNT);
  await expect(page.locator('[role="status"]')).toHaveText("3 of 3 rows frozen");
  expect(pageErrors).toEqual([]);
});
