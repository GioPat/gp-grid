// benchmarks/conformance/frozen-rows-rtl.spec.ts
// The band under `dir="rtl"` (step 20). The vertical geometry is direction
// independent, the pins are compared against the grid's own 004 pin boxes and
// the only direction-sensitive number comes from the scroller itself. Runs in
// the react, vue and angular projects.

import { expect, test, type Page } from "@playwright/test";
import {
  armFreezeRows,
  BLOCK_HEIGHT,
  blockBox,
  bodyMetrics,
  FROZEN_COUNT,
  frozenBlock,
  frozenCell,
  frozenPinBox,
  gridPinBox,
  rowRegions,
  waitForScroll,
} from "./frozen-rows-helpers";
import {
  expectBand,
  frozenAriaRowIndices,
  frozenCenterColumns,
} from "./frozen-rows-runtime-helpers";
import { openFixture, TOLERANCE } from "./helpers";

interface RtlRange {
  tops: number[];
  /** The inline end, negative in RTL; the inline start is always 0. */
  endLeft: number;
}

/** `toggle-rtl` remounts the armed grid with the host's `dir` flipped. */
const useRtl = async (page: Page): Promise<void> => {
  await page.getByTestId("toggle-rtl").click();
  await expect(page.locator('[data-testid="grid-host"]')).toHaveAttribute("dir", "rtl");
  await expect(frozenBlock(page)).toHaveCount(1);
  await expect.poll(async () => (await rowRegions(page))?.frozenCount ?? 0).toBe(FROZEN_COUNT);
};

const rtlRange = async (page: Page): Promise<RtlRange> => {
  const metrics = await bodyMetrics(page);
  expect(metrics.maxScrollLeft, "RTL has an inline scroll range").toBeGreaterThan(0);
  return {
    tops: [0, Math.floor(metrics.maxScroll / 2), metrics.maxScroll - 200],
    endLeft: -metrics.maxScrollLeft,
  };
};

const centerCellBox = async (page: Page, row: number, column: number): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
}> => {
  // A center column is mounted in the block only, so the unscoped frozen cell
  // is exactly one element.
  const box = await frozenCell(page, row, column).boundingBox();
  if (box === null) throw new Error(`Frozen center cell ${row}/${column} is not measurable.`);
  return box;
};

test("keeps the band under the header in RTL", async ({ page }, testInfo) => {
  const pageErrors = await armFreezeRows(page, testInfo.project.name);
  await useRtl(page);
  const { tops, endLeft } = await rtlRange(page);
  const ariaIndices = Array.from({ length: FROZEN_COUNT }, (_, index) => index + 1);

  for (const top of tops) {
    for (const left of [0, endLeft]) {
      await waitForScroll(page, top, left);
      const block = await blockBox(page);
      expect(Math.abs(block.top), `block top at ${top}/${left}`).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(block.height - BLOCK_HEIGHT), `block height at ${top}/${left}`)
        .toBeLessThanOrEqual(TOLERANCE);
      expect(await frozenAriaRowIndices(page), `frozen aria-rowindex at ${top}/${left}`)
        .toEqual(ariaIndices);
    }
  }

  await waitForScroll(page, 0, 0);
  await expectBand(page, FROZEN_COUNT);
  expect(pageErrors).toEqual([]);
});

test("matches the grid's own pins and scrolls the center cells in RTL", async ({ page }, testInfo) => {
  const pageErrors = await armFreezeRows(page, testInfo.project.name);
  await useRtl(page);
  const { endLeft } = await rtlRange(page);

  for (const left of [0, endLeft]) {
    await waitForScroll(page, 0, left);
    for (const region of ["start", "end"] as const) {
      const reference = await gridPinBox(page, region);
      const frozen = await frozenPinBox(page, region);
      expect(Math.abs(frozen.x - reference.x), `${region} pin x at ${left}`)
        .toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(frozen.width - reference.width), `${region} pin width at ${left}`)
        .toBeLessThanOrEqual(TOLERANCE);
    }
  }

  // The column window mounts a different set of center columns at each
  // extreme, so a shared one carries the movement.
  await waitForScroll(page, 0, 0);
  const atStart = await frozenCenterColumns(page, 0);
  await waitForScroll(page, 0, endLeft);
  const atEnd = await frozenCenterColumns(page, 0);
  const shared = atStart.filter((column) => atEnd.includes(column));
  expect(shared.length, "a frozen center column mounted at both extremes").toBeGreaterThan(0);
  const column = shared[0]!;

  await waitForScroll(page, 0, 0);
  const startLeft = (await bodyMetrics(page)).scrollLeft;
  const before = await centerCellBox(page, 0, column);
  await waitForScroll(page, 0, endLeft);
  const after = await centerCellBox(page, 0, column);
  const delta = (await bodyMetrics(page)).scrollLeft - startLeft;
  // Content moves by `-delta` physically, so the expectation comes from the
  // scroller's own numbers rather than from a direction-specific coordinate.
  expect(Math.abs(after.x - before.x + delta), "frozen center cell movement")
    .toBeLessThanOrEqual(TOLERANCE);
  expect(pageErrors).toEqual([]);
});
