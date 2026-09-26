// benchmarks/conformance/frozen-rows-paging.spec.ts
// AC-005-04's fixture half: the prefix and suffix share the cache without
// requesting the gap between them, and the tight variant falls back to zero.

import { expect, test } from "@playwright/test";
import {
  armFrozenPaged,
  BLOCK_HEIGHT,
  bodyMetrics,
  FROZEN_COUNT,
  firstRequest,
  frozenCell,
  frozenRows,
  holdFrozenRows,
  mountedRows,
  PAGE_SIZE,
  requestedRanges,
  ROW_HEIGHT,
  rowRegions,
  SAMPLE_ROW_COUNT,
  waitForScroll,
} from "./frozen-rows-helpers";
import {
  firstSuffixIndex,
  mountedRowBound,
  scrollNear,
} from "./frozen-rows-runtime-helpers";
import { openFixture } from "./helpers";

const DEEP_TOP = 5_000_000;
const NEAR_ROW = 899_999;

test("keeps frozen rows resident while the suffix scrolls", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await armFrozenPaged(page, "use-frozen-paged");
  await expect(frozenCell(page, 0, 1)).toHaveText("1");

  // The bootstrap range covers the prefix block, so rows 0-2 arrive first.
  expect(firstRequest(await requestedRanges(page))).toEqual({ startRow: 0, endRow: PAGE_SIZE });
  await expect(frozenCell(page, 2, 1)).toHaveText("17");

  await waitForScroll(page, DEEP_TOP, 0);
  await expect.poll(async () => (await rowRegions(page))?.frozenCount ?? 0).toBe(FROZEN_COUNT);
  // Prefix rows keep their data and their place in the band.
  await expect(frozenCell(page, 0, 1)).toHaveText("1");
  await expect(frozenCell(page, 2, 1)).toHaveText("17");
  expect(pageErrors).toEqual([]);
});

test("requests only the visible suffix blocks, never the gap", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await armFrozenPaged(page, "use-frozen-paged");
  await expect(frozenCell(page, 0, 1)).toHaveText("1");
  const before = (await requestedRanges(page)).length;

  await waitForScroll(page, DEEP_TOP, 0);
  await expect.poll(async () => (await requestedRanges(page)).length).toBeGreaterThan(before);

  const fresh = (await requestedRanges(page)).slice(before);
  // Far from the prefix and at most the visible page plus its overscan.
  expect(fresh.length).toBeLessThanOrEqual(4);
  for (const range of fresh) {
    expect(range.startRow, `requested ${range.startRow}`).toBeGreaterThan(100_000);
    expect(range.endRow - range.startRow).toBeLessThanOrEqual(3 * PAGE_SIZE);
  }
  // The prefix is reserved, so it is never re-fetched from a deep scroll.
  expect(fresh.some((range) => range.startRow === 0)).toBe(false);
  await expect(frozenCell(page, 0, 1)).toHaveText("1");
  expect(pageErrors).toEqual([]);
});

test("renders a frozen placeholder without a grid-level overlay", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await holdFrozenRows(page);
  await armFrozenPaged(page, "use-frozen-paged");

  // The withheld prefix loads as three placeholders; the visible suffix is
  // resident, so no DATA_LOADING reaches the grid-level overlay (C7/C8).
  const block = page.locator(".gp-grid-frozen-rows");
  await expect(block).toHaveCount(1);
  await expect(block.locator(".gp-grid-row--loading")).toHaveCount(FROZEN_COUNT);
  await expect(block.locator(".gp-grid-cell")).toHaveCount(0);
  await expect(page.locator(".gp-grid-loading-overlay")).toHaveCount(0);
  await expect(page.locator(".gp-grid-frozen-pins .gp-grid-frozen-pin-row")).toHaveCount(0);

  // The next arm serves the prefix, so the placeholder gives way to cells.
  await armFrozenPaged(page, "use-frozen-paged");
  await expect.poll(async () => block.locator(".gp-grid-cell").count()).toBeGreaterThan(0);
  await expect(block.locator(".gp-grid-row--loading")).toHaveCount(0);
  await expect(frozenCell(page, 0, 1)).toHaveText("1");
  expect(pageErrors).toEqual([]);
});

test("resolves the tight variant to effective zero", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await armFrozenPaged(page, "use-frozen-paged-tight");

  await expect.poll(async () => frozenRows(page)).toMatchObject({
    requestedCount: FROZEN_COUNT,
    effectiveCount: 0,
    limit: "cache",
  });
  await expect(page.locator(".gp-grid-frozen-rows")).toHaveCount(0);
  // The visible window keeps the flat loader's soft policy and serves row 0.
  await expect(page.locator('[data-cell-row="0"][data-cell-col="1"]')).toHaveText("1");
  const metrics = await bodyMetrics(page);
  expect(metrics.clientHeight).toBeGreaterThan(0);
  const ranges = await requestedRanges(page);
  expect(firstRequest(ranges)).toEqual({ startRow: 0, endRow: PAGE_SIZE });
  expect(ranges.every((range) => range.endRow - range.startRow <= PAGE_SIZE)).toBe(true);
  expect(pageErrors).toEqual([]);
});

test("keeps the prefix and a near-900,000 suffix inside the cache budget", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await armFrozenPaged(page, "use-frozen-paged");
  await expect(frozenCell(page, 0, 1)).toHaveText("1");
  const before = (await requestedRanges(page)).length;

  // The compressed mapping: the requested logical top scaled into DOM space.
  const metrics = await bodyMetrics(page);
  const ratio = metrics.maxScroll / (SAMPLE_ROW_COUNT * ROW_HEIGHT - metrics.clientHeight);
  await scrollNear(page, (NEAR_ROW * ROW_HEIGHT - BLOCK_HEIGHT) * ratio);
  await expect.poll(async () => firstSuffixIndex(await mountedRows(page)))
    .toBeGreaterThan(899_000);

  // The prefix stays resident and keeps its values at the far scroll position.
  await expect.poll(async () => (await rowRegions(page))?.frozenCount ?? 0).toBe(FROZEN_COUNT);
  await expect(frozenCell(page, 0, 1)).toHaveText("1");
  await expect(frozenCell(page, 1, 1)).toHaveText("9");
  await expect(frozenCell(page, 2, 1)).toHaveText("17");

  await expect.poll(async () => (await requestedRanges(page)).length).toBeGreaterThan(before);
  const fresh = (await requestedRanges(page)).slice(before);
  for (const range of fresh) {
    expect(range.startRow, `requested ${range.startRow}`).toBeGreaterThanOrEqual(899_800);
    expect(range.endRow, `requested ${range.startRow}-${range.endRow}`).toBeLessThanOrEqual(900_200);
  }
  // Both blocks under the visible suffix are requested, and neither the
  // prefix nor the gap between it and the suffix is re-fetched.
  const starts = fresh.map((range) => range.startRow);
  expect(starts).toContain(899_900);
  expect(starts).toContain(900_000);
  expect(starts).not.toContain(0);
  expect(fresh.filter((range) => range.endRow < 899_800)).toEqual([]);

  // The frozen part is never above `maxCount`; the suffix window is bounded.
  expect(await page.locator(".gp-grid-row").count())
    .toBeLessThanOrEqual(mountedRowBound(metrics.clientHeight));
  expect(pageErrors).toEqual([]);
});
