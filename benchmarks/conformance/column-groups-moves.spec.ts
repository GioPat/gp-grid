// benchmarks/conformance/column-groups-moves.spec.ts
// AC-007-11: moving `x` between `a` and `b` by the control, a header drag and
// Alt+Shift+Arrow splits Q1 into two labelled fragments and moving it back
// joins them; an over-budget move changes nothing; the same moves hold in the
// start, center and end regions. Runs in the react, vue and angular projects.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { activeCell } from "./frozen-rows-helpers";
import { columnIds, columnState, eventCounts, headerCell, resetEventCounts } from "./helpers";
import { activateCell } from "./pinning-helpers";
import {
  armColumnGroups,
  B,
  columnGroups,
  expectGroupedHeader,
  fragmentsOf,
  generation,
  GROUPS,
  gridMarkup,
  groupSpans,
  lastSchemaResult,
  LEAF_IDS,
  liveRegion,
  nextFrames,
  pinColumn,
  readHeader,
  X,
  type Region,
} from "./column-groups-helpers";

const BETWEEN = ["a", "x", "b", "c", "d", "e", "f"];

const centerOf = async (locator: Locator): Promise<{ x: number; y: number }> => {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("Element is not measurable.");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** Two Q1 fragments, one above `a` and one above `b`, with distinct ids. */
const expectSplitQ1 = async (page: Page, regions: [Region, Region], colIndexes: [number, number]): Promise<void> => {
  await expectGroupedHeader(page, GROUPS);
  const view = await readHeader(page);
  const q1 = fragmentsOf(view, "Q1").sort((first, second) => first.colIndex - second.colIndex);
  expect(q1.map((cell) => [cell.region, cell.colIndex, cell.colSpan])).toEqual([
    [regions[0], colIndexes[0], 1],
    [regions[1], colIndexes[1], 1],
  ]);
  expect(new Set(q1.map((cell) => cell.id)).size).toBe(2);
  const leaves = view.cells.filter((cell) => cell.kind === "leaf");
  for (const [position, fragment] of q1.entries()) {
    const leaf = leaves.find((cell) => cell.text === ["A", "B"][position]);
    expect(leaf?.colIndex).toBe(fragment.colIndex);
    expect(leaf?.describedBy).toContain(fragment.id);
  }
};

const expectJoinedQ1 = async (page: Page, region: Region): Promise<void> => {
  await expectGroupedHeader(page, GROUPS);
  expect((await groupSpans(page, "Q1")).map((span) => [span.region, span.colSpan])).toEqual([[region, 2]]);
};

test("AC-007-11 move-x-between splits Q1, move-x-back and reset-order join it, and the active cell follows x", async ({ page }, testInfo) => {
  const pageErrors = await armColumnGroups(page, testInfo.project.name);
  await activateCell(page, 1, X);
  await expect.poll(() => activeCell(page)).toEqual({ row: 1, col: X });
  const active = page.locator(".gp-grid-cell--active");

  await page.getByTestId("move-x-between").click();

  expect(await lastSchemaResult(page)).toEqual({ status: "applied" });
  await expect.poll(() => columnIds(page)).toEqual(BETWEEN);
  await expectSplitQ1(page, ["center", "center"], [1, 3]);
  await expect.poll(() => activeCell(page)).toEqual({ row: 1, col: 1 });
  await expect(active).toHaveAttribute("data-cell-col", "1");
  await expect(active).toHaveText("X 1");

  await page.getByTestId("move-x-back").click();
  await expect.poll(() => columnIds(page)).toEqual([...LEAF_IDS]);
  await expectJoinedQ1(page, "center");
  await expect.poll(() => activeCell(page)).toEqual({ row: 1, col: X });

  await page.getByTestId("move-x-between").click();
  await expectSplitQ1(page, ["center", "center"], [1, 3]);
  await page.getByTestId("reset-order").click();
  expect(await lastSchemaResult(page)).toEqual({ status: "applied" });
  await expect.poll(() => columnIds(page)).toEqual([...LEAF_IDS]);
  await expectJoinedQ1(page, "center");
  await expect(active).toHaveText("X 1");

  // The moves changed the order only; the caller's hierarchy reads back as passed.
  expect(await columnGroups(page)).toEqual(GROUPS);
  expect(pageErrors).toEqual([]);
});

test("AC-007-11 a header drag of x onto b splits Q1", async ({ page }, testInfo) => {
  const pageErrors = await armColumnGroups(page, testInfo.project.name);
  // At 800 px the host shows x's start beside a and b, so the drag needs no auto-scroll.
  await page.getByTestId("resize-host").click();
  await expect.poll(async () => (await page.getByTestId("grid-host").boundingBox())?.width).toBe(800);
  await resetEventCounts(page);
  const source = await headerCell(page, X).boundingBox();
  const grid = await page.locator('[role="grid"]').boundingBox();
  if (source === null || grid === null) throw new Error("Headers are not measurable.");
  // Past the leading pin button, in the last band, which `b`'s header shares.
  const start = { x: source.x + 55, y: source.y + source.height - 18 };
  expect(start.x).toBeLessThan(grid.x + grid.width - 10);
  const target = { x: (await centerOf(headerCell(page, B))).x, y: start.y };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 40, start.y, { steps: 4 });
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await page.mouse.up();

  await expect.poll(() => columnIds(page)).toEqual(BETWEEN);
  await expectSplitQ1(page, ["center", "center"], [1, 3]);
  expect((await eventCounts(page)).moved).toBe(1);
  expect(await columnGroups(page)).toEqual(GROUPS);
  expect(pageErrors).toEqual([]);
});

test("AC-007-11 Alt+Shift+ArrowLeft walks x across the groups and the active cell follows it", async ({ page }, testInfo) => {
  const pageErrors = await armColumnGroups(page, testInfo.project.name);
  await page.locator('[role="grid"]').focus();
  await activateCell(page, 0, X);
  await expect.poll(() => activeCell(page)).toEqual({ row: 0, col: X });
  await resetEventCounts(page);

  for (let step = 0; step < 5; step += 1) await page.keyboard.press("Alt+Shift+ArrowLeft");

  await expect.poll(() => columnIds(page)).toEqual(BETWEEN);
  expect((await eventCounts(page)).moved).toBe(5);
  await expectSplitQ1(page, ["center", "center"], [1, 3]);
  await expect.poll(() => activeCell(page)).toEqual({ row: 0, col: 1 });
  const active = page.locator(".gp-grid-cell--active");
  await expect(active).toHaveAttribute("data-cell-col", "1");
  await expect(active).toHaveText("X 0");
  await expect(page.locator('[role="grid"]')).toBeFocused();
  expect(pageErrors).toEqual([]);
});

test("AC-007-11 over-budget-move leaves order, pins and DOM unchanged", async ({ page }, testInfo) => {
  const pageErrors = await armColumnGroups(page, testInfo.project.name);
  const previous = await generation(page);
  await page.getByTestId("over-budget-move").click();
  await expect.poll(() => generation(page)).toBeGreaterThan(previous);
  await expectGroupedHeader(page, GROUPS);
  const ids = await columnIds(page);
  const pins = (await columnState(page)).map((entry) => [entry.columnId, entry.pinned, entry.region]);
  const before = await gridMarkup(page);

  await page.getByTestId("move-x-between").click();

  expect(await lastSchemaResult(page)).toEqual({
    status: "rejected",
    error: {
      code: "limit",
      source: "move",
      limit: "maxFragments",
      message: "Column groups exceed the maxFragments budget",
    },
  });
  await expect(liveRegion(page)).toHaveText("Column groups exceed the maxFragments budget");
  await nextFrames(page);
  expect(await columnIds(page)).toEqual(ids);
  expect((await columnState(page)).map((entry) => [entry.columnId, entry.pinned, entry.region])).toEqual(pins);
  expect(await gridMarkup(page)).toEqual(before);
  expect(pageErrors).toEqual([]);
});

test("AC-007-11 the same moves hold in the start, center and end regions after pin-a", async ({ page }, testInfo) => {
  const pageErrors = await armColumnGroups(page, testInfo.project.name);
  const moveBetween = () => page.getByTestId("move-x-between").click();
  const moveBack = () => page.getByTestId("move-x-back").click();

  // `a` alone in the start pin: the region boundary already splits Q1.
  await page.getByTestId("pin-a").click();
  await expectSplitQ1(page, ["start", "center"], [1, 2]);
  await moveBetween();
  await expect.poll(() => columnIds(page)).toEqual(BETWEEN);
  await expectSplitQ1(page, ["start", "center"], [1, 3]);
  await moveBack();
  await expect.poll(() => columnIds(page)).toEqual([...LEAF_IDS]);
  await expectSplitQ1(page, ["start", "center"], [1, 2]);

  // `a` and `b` together in one pin: x lands between them inside that pin.
  for (const region of ["start", "end"] as const) {
    await pinColumn(page, "a", region);
    await pinColumn(page, "b", region);
    await expectJoinedQ1(page, region);
    const first = region === "start" ? 1 : 5;
    await moveBetween();
    await expect.poll(async () =>
      (await columnState(page)).find((entry) => entry.columnId === "x")?.region).toBe(region);
    await expectSplitQ1(page, [region, region], [first, first + 2]);
    await moveBack();
    await expectJoinedQ1(page, region);
  }

  expect(await columnGroups(page)).toEqual(GROUPS);
  expect(pageErrors).toEqual([]);
});
