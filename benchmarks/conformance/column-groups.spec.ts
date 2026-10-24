// benchmarks/conformance/column-groups.spec.ts
// AC-007-05/08/09/12: the three-level uneven fixture's bands and fragments,
// alignment through scroll, pins and hide/show, atomic hierarchy replacement,
// rejected hierarchies, band growth against the anchor and the frozen
// capacity, and an offscreen header taller than its band. Runs in the react,
// vue and angular projects.

import { expect, test } from "@playwright/test";
import { bodyMetrics, frozenRows, mountedRows, rowRegions, scroller, waitForScroll } from "./frozen-rows-helpers";
import { columnIds, columnState, expectAligned, readHook, TOLERANCE } from "./helpers";
import { boxAt, firstVisibleRow } from "./row-heights-helpers";
import {
  armColumnGroups,
  bandsOf,
  columnGroups,
  expectGroupedHeader,
  fragmentsOf,
  GROUPS,
  gridMarkup,
  HEADER_HEIGHT,
  headerBands,
  lastSchemaResult,
  LEAF_IDS,
  LEAF_WIDTH,
  liveRegion,
  nextFrames,
  readHeader,
  REPLACEMENT_GROUPS,
  setColumnWidth,
  setHeaderBandHeights,
  startHeaderFrames,
  stopHeaderFrames,
  TALL_BAND_HEIGHT,
  WIDE_TALL_LEAF,
} from "./column-groups-helpers";

const FOUR_BANDS = bandsOf([HEADER_HEIGHT, HEADER_HEIGHT, HEADER_HEIGHT, HEADER_HEIGHT]);
const TALL_BANDS = bandsOf([HEADER_HEIGHT, HEADER_HEIGHT, HEADER_HEIGHT, TALL_BAND_HEIGHT]);
/** Mid-scroll offset, 25 rows down. */
const SCROLL_TOP = 800;
/** `a`'s resized width, kept through the replacement. */
const RESIZED_A = 160;

test("AC-007-08 the three-level uneven fixture renders four bands with every fragment on its run", async ({ page }, testInfo) => {
  const pageErrors = await armColumnGroups(page, testInfo.project.name);

  expect(await headerBands(page)).toEqual(FOUR_BANDS);
  const { view } = await expectGroupedHeader(page, GROUPS);
  expect(fragmentsOf(view).map((cell) => [cell.fragmentId, cell.colIndex, cell.colSpan, cell.text]).sort())
    .toEqual([
      ["North:center:0", 1, 3, "North"],
      ["Q1:center:0", 1, 2, "Q1"],
      ["Region:center:0", 1, 4, "Region"],
      ["Totals:center:0", 5, 2, "Totals"],
    ]);
  // Uneven depths: each leaf starts at its own band and ends on the body.
  const leaves = view.cells.filter((cell) => cell.kind === "leaf").sort((a, b) => a.colIndex - b.colIndex);
  expect(leaves.map((cell) => [cell.text, cell.top, cell.height])).toEqual([
    ["A", 108, 36], ["B", 108, 36], ["C", 72, 72], ["D", 36, 108], ["E", 36, 108], ["F", 36, 108], ["X", 0, 144],
  ]);
  await expectAligned(page, LEAF_IDS.length);
  expect(pageErrors).toEqual([]);
});

test("AC-007-09 horizontal scroll, pin, hide and show keep the bands and the fragments on their runs", async ({ page }, testInfo) => {
  const pageErrors = await armColumnGroups(page, testInfo.project.name);
  const expectSameBands = async (): Promise<void> => {
    expect(await headerBands(page)).toEqual(FOUR_BANDS);
    expect((await readHeader(page)).clientHeight).toBe(FOUR_BANDS.totalHeight);
  };

  await waitForScroll(page, 0, (await bodyMetrics(page)).maxScrollLeft);
  await expectGroupedHeader(page, GROUPS);
  await expectSameBands();
  await expectAligned(page, LEAF_IDS.length);
  await waitForScroll(page, 0, 0);

  await page.getByTestId("pin-a").click();
  expect(await lastSchemaResult(page)).toEqual({ status: "applied" });
  await expect.poll(async () => (await columnState(page)).find((entry) => entry.columnId === "a")?.region).toBe("start");
  await expectGroupedHeader(page, GROUPS);
  await expectSameBands();
  await expectAligned(page, LEAF_IDS.length);

  await page.getByTestId("hide-b").click();
  expect(await lastSchemaResult(page)).toEqual({ status: "applied" });
  await expectGroupedHeader(page, GROUPS);
  await expectSameBands();
  await expectAligned(page, LEAF_IDS.length - 1);

  await page.getByTestId("show-b").click();
  await expectGroupedHeader(page, GROUPS);
  await expectSameBands();
  await expectAligned(page, LEAF_IDS.length);
  expect(await columnGroups(page)).toEqual(GROUPS);
  expect(pageErrors).toEqual([]);
});

test("AC-007-09 replace-groups moves the bands in one render and keeps a's resized width", async ({ page }, testInfo) => {
  const pageErrors = await armColumnGroups(page, testInfo.project.name);
  await setColumnWidth(page, "a", RESIZED_A);
  await expect.poll(async () => {
    const q1 = fragmentsOf(await readHeader(page), "Q1");
    return q1.map((cell) => Math.round(cell.width));
  }).toEqual([RESIZED_A + LEAF_WIDTH]);

  await startHeaderFrames(page);
  await page.getByTestId("replace-groups").click();
  await expectGroupedHeader(page, REPLACEMENT_GROUPS);
  await nextFrames(page);
  const frames = await stopHeaderFrames(page);

  // Every frame shows the old or the new hierarchy whole: Q1 narrows to `a`
  // in the frame where `b` grows into the band Q1 no longer covers.
  expect(frames).toEqual([
    `q1=${RESIZED_A + LEAF_WIDTH}:2|b=108,36,4`,
    `q1=${RESIZED_A}:1|b=72,72,3`,
  ]);
  expect(await headerBands(page)).toEqual(FOUR_BANDS);
  expect((await columnState(page)).find((entry) => entry.columnId === "a")?.width).toBe(RESIZED_A);
  expect(await columnIds(page)).toEqual([...LEAF_IDS]);
  expect(await columnGroups(page)).toEqual(REPLACEMENT_GROUPS);
  await expectAligned(page, LEAF_IDS.length);
  expect(pageErrors).toEqual([]);
});

test("AC-007-09 reject-cycle and reject-missing change nothing in the DOM and report their codes", async ({ page }, testInfo) => {
  const pageErrors = await armColumnGroups(page, testInfo.project.name);
  await expectGroupedHeader(page, GROUPS);
  const before = await gridMarkup(page);
  const cases = [
    { control: "reject-cycle", code: "cycle", id: "Region", message: 'Column group "Region" contains itself' },
    { control: "reject-missing", code: "missingLeaf", id: "x", message: 'Column "x" is missing from the column groups' },
  ];

  for (const { control, code, id, message } of cases) {
    await page.getByTestId(control).click();
    await expect.poll(() => lastSchemaResult(page)).toEqual({
      status: "rejected",
      error: { code, source: "groups", id, message },
    });
    await expect(liveRegion(page)).toHaveText(message);
    await nextFrames(page);
    expect(await gridMarkup(page)).toEqual(before);
    expect(await columnGroups(page)).toEqual(GROUPS);
    expect(await headerBands(page)).toEqual(FOUR_BANDS);
  }
  expect(pageErrors).toEqual([]);
});

test("AC-007-05 tall-band mid-scroll grows the header by 36 and keeps the first visible row's offset", async ({ page }, testInfo) => {
  const pageErrors = await armColumnGroups(page, testInfo.project.name);
  await waitForScroll(page, SCROLL_TOP, 0);
  const anchor = await firstVisibleRow(page);
  const anchorBox = await boxAt(page, anchor);
  const bodyTop = async (): Promise<number> => (await scroller(page).boundingBox())?.y ?? Number.NaN;
  const topBefore = await bodyTop();
  const clientBefore = (await bodyMetrics(page)).clientHeight;

  await page.getByTestId("tall-band").click();

  await expect.poll(() => headerBands(page)).toEqual(TALL_BANDS);
  await expectGroupedHeader(page, GROUPS);
  await expect.poll(async () => Math.abs((await bodyTop()) - topBefore - HEADER_HEIGHT)).toBeLessThanOrEqual(TOLERANCE);
  expect(Math.abs((await bodyMetrics(page)).clientHeight - (clientBefore - HEADER_HEIGHT))).toBeLessThanOrEqual(TOLERANCE);
  // The body gave up the growth, and the row at the clip top stays there.
  await expect.poll(async () => Math.abs(((await boxAt(page, anchor))?.top ?? Number.NaN) - anchorBox!.top))
    .toBeLessThanOrEqual(TOLERANCE);
  expect(await firstVisibleRow(page)).toBe(anchor);
  expect(pageErrors).toEqual([]);
});

test("AC-007-05 on the short host, tall-band lowers the effective frozen count and announces it", async ({ page }, testInfo) => {
  const pageErrors = await armColumnGroups(page, testInfo.project.name);
  await page.getByTestId("freeze-three").click();
  await expect.poll(() => frozenRows(page)).toEqual({ requestedCount: 3, effectiveCount: 3, limit: null });

  await page.getByTestId("tall-band").click();

  await expect.poll(() => frozenRows(page)).toEqual({ requestedCount: 3, effectiveCount: 2, limit: "viewport" });
  expect((await rowRegions(page))?.frozenExtent).toBe(2 * 32);
  await expect.poll(async () => (await mountedRows(page)).filter((row) => row.frozen).map((row) => row.index))
    .toEqual([0, 1]);
  const message = "2 of 3 rows frozen";
  expect((await readHook<{ message: string } | null>(page, "announcement"))?.message).toBe(message);
  await expect(liveRegion(page)).toHaveText(message);
  expect((await readHeader(page)).clientHeight).toBe(TALL_BANDS.totalHeight);

  // Dropping the configured height gives the rows their room back.
  await setHeaderBandHeights(page, null);
  await expect.poll(() => frozenRows(page)).toEqual({ requestedCount: 3, effectiveCount: 3, limit: null });
  expect(await headerBands(page)).toEqual(FOUR_BANDS);
  expect(pageErrors).toEqual([]);
});

test("AC-007-12 the offscreen leaf 150 mounts clipped to its band while the bands stay", async ({ page }, testInfo) => {
  const pageErrors = await armColumnGroups(page, testInfo.project.name, "wide");
  const threeBands = bandsOf([HEADER_HEIGHT, HEADER_HEIGHT, HEADER_HEIGHT]);
  expect(await headerBands(page)).toEqual(threeBands);
  const leaf = page.locator(`.gp-grid-header [data-col-index="${WIDE_TALL_LEAF}"]`);
  await expect(leaf).toHaveCount(0);

  await waitForScroll(page, 0, WIDE_TALL_LEAF * LEAF_WIDTH);

  await expect(leaf).toHaveCount(1);
  await expect(leaf).toHaveClass(/gp-grid-header-cell--wrap/);
  const clip = await leaf.evaluate((node) => {
    const text = node.querySelector<HTMLElement>(".gp-grid-header-text");
    const cellBox = node.getBoundingClientRect();
    const textBox = text?.getBoundingClientRect();
    return {
      cellHeight: cellBox.height,
      textOverflow: (text?.scrollHeight ?? 0) - (text?.clientHeight ?? 0),
      textContent: text?.scrollHeight ?? 0,
      textBelowCell: (textBox?.bottom ?? Number.POSITIVE_INFINITY) - cellBox.bottom,
      describedBy: (node.getAttribute("aria-describedby") ?? "").split(" ").length,
    };
  });
  // The wrapped text is taller than the band, and the band clips it.
  expect(clip.cellHeight).toBe(HEADER_HEIGHT);
  expect(clip.textContent).toBeGreaterThan(HEADER_HEIGHT);
  expect(clip.textOverflow).toBeGreaterThan(TOLERANCE);
  expect(clip.textBelowCell).toBeLessThanOrEqual(TOLERANCE);
  expect(clip.describedBy).toBe(2);
  expect(await headerBands(page)).toEqual(threeBands);
  const view = await readHeader(page);
  expect(view.clientHeight).toBe(threeBands.totalHeight);
  expect(view.bandRows.map((row) => row.rowIndex)).toEqual([1, 2, 3]);
  expect(pageErrors).toEqual([]);
});
