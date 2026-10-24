// benchmarks/conformance/rtl.spec.ts
// Inline-axis normalization (B8): the fixture is remounted with `dir="rtl"`
// and every x the core publishes must mirror correctly at the DOM boundary.

import { expect, test, type Page } from "@playwright/test";
import {
  bodyScroller,
  cell,
  expectAligned,
  headerCell,
  openFixture,
  readHook,
  TOLERANCE,
} from "./helpers";

/** Distance the fill handle sits inside its cell's inline end. */
const HANDLE_INSET = 20;
const COLUMN_COUNT = 8;

interface CellBoundsSnapshot {
  top: number;
  left: number;
  width: number;
  height: number;
}

const activeCell = (page: Page): Promise<{ row: number; col: number } | null> =>
  readHook<{ row: number; col: number } | null>(page, "activeCell");

const cellBounds = (page: Page, row: number, layoutIndex: number): Promise<CellBoundsSnapshot | null> =>
  page.evaluate(
    ({ targetRow, targetIndex }) => {
      const hooks = (globalThis as unknown as {
        __gpConformance?: {
          cellBounds: (row: number, col: number) => CellBoundsSnapshot | null;
        };
      }).__gpConformance;
      return hooks?.cellBounds(targetRow, targetIndex) ?? null;
    },
    { targetRow: row, targetIndex: layoutIndex },
  );

const bodyMetrics = (page: Page): Promise<{ scrollLeft: number; clientWidth: number }> =>
  bodyScroller(page).evaluate((element) => ({
    scrollLeft: element.scrollLeft,
    clientWidth: element.clientWidth,
  }));

/** Remount the grid with the host's `dir` flipped to RTL. */
const useRtl = async (page: Page): Promise<void> => {
  await page.getByTestId("toggle-rtl").click();
  await expect(page.locator('[data-testid="grid-host"]')).toHaveAttribute("dir", "rtl");
  // A wrapper mounts only the columns inside its window, so the grid remount is
  // asserted as a bounded, non-empty set rather than the full column count.
  await expect.poll(() => page.locator(".gp-grid-header-cell").count()).toBeGreaterThan(0);
  expect(await page.locator(".gp-grid-header-cell").count()).toBeLessThanOrEqual(COLUMN_COUNT);
  await expect(cell(page, 0, 1)).toContainText("Row 000");
};

/** Physical screen box of a viewport-space (inline-start relative) core rect. */
const mirror = (
  scrollerBox: { x: number; y: number; width: number; height: number },
  bounds: CellBoundsSnapshot,
): { left: number; right: number; centerX: number; centerY: number } => {
  const right = scrollerBox.x + scrollerBox.width - bounds.left;
  const left = right - bounds.width;
  return {
    left,
    right,
    centerX: (left + right) / 2,
    centerY: scrollerBox.y + bounds.top + bounds.height / 2,
  };
};

test("headers and cells mirror at the inline start", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await useRtl(page);

  // No horizontal scroll yet: the first column starts at the client box's
  // inline start, which in RTL is its physical right edge.
  await expectAligned(page, COLUMN_COUNT);
  const scrollerBox = await bodyScroller(page).boundingBox();
  if (scrollerBox === null) throw new Error("Body scroller is not measurable.");
  const firstBox = await headerCell(page, 0).boundingBox();
  if (firstBox === null) throw new Error("Header cell is not measurable.");
  expect(Math.abs(firstBox.x + firstBox.width - (scrollerBox.x + scrollerBox.width)))
    .toBeLessThanOrEqual(TOLERANCE);
  expect((await bodyMetrics(page)).scrollLeft).toBe(0);

  // Scrolling toward the inline end keeps header and body aligned.
  await bodyScroller(page).evaluate((element) => {
    element.scrollTo({ left: -120 });
    element.dispatchEvent(new Event("scroll"));
  });
  await expect.poll(async () => (await bodyMetrics(page)).scrollLeft).toBe(-120);
  await expectAligned(page, COLUMN_COUNT);
  expect(pageErrors).toEqual([]);
});

test("a pointer hit-test round-trips through the mirrored geometry", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await useRtl(page);

  // Column 3 ends at inline offset 530, inside the 600 px client box, so it is
  // visible without scrolling: the click has to land where the core says.
  const bounds = await cellBounds(page, 3, 3);
  expect(bounds).not.toBeNull();
  const scrollerBox = await bodyScroller(page).boundingBox();
  if (scrollerBox === null) throw new Error("Body scroller is not measurable.");
  const target = mirror(scrollerBox, bounds!);
  expect(target.left).toBeGreaterThanOrEqual(scrollerBox.x - TOLERANCE);
  expect(target.right).toBeLessThanOrEqual(scrollerBox.x + scrollerBox.width + TOLERANCE);

  await page.mouse.click(target.centerX, target.centerY);
  await expect.poll(() => activeCell(page)).toEqual({ row: 3, col: 3 });
  expect(pageErrors).toEqual([]);
});

test("keyboard arrows move focus toward the side they point at", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await useRtl(page);

  const cellX = async (layoutIndex: number): Promise<number> => {
    const box = await cell(page, 0, layoutIndex).boundingBox();
    if (box === null) throw new Error("Cell is not measurable.");
    return box.x;
  };

  await cell(page, 0, 0).click();
  await expect.poll(() => activeCell(page)).toEqual({ row: 0, col: 0 });

  // Column 0 sits at the client box's inline start, its physical right edge:
  // nothing lies to its right, so ArrowRight must not move focus.
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => activeCell(page)).toEqual({ row: 0, col: 0 });

  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => activeCell(page)).toEqual({ row: 0, col: 1 });
  expect(await cellX(1)).toBeLessThan(await cellX(0));

  await page.keyboard.press("ArrowRight");
  await expect.poll(() => activeCell(page)).toEqual({ row: 0, col: 0 });

  // Toward the inline end, i.e. physically leftward.
  for (let step = 0; step < COLUMN_COUNT - 1; step += 1) {
    await page.keyboard.press("ArrowLeft");
  }
  await expect.poll(() => activeCell(page)).toEqual({ row: 0, col: COLUMN_COUNT - 1 });
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => activeCell(page)).toEqual({ row: 0, col: COLUMN_COUNT - 1 });

  // RTL DOM scroll positions are zero at the inline start and negative along
  // the inline axis; reaching the last column must move the axis.
  const metrics = await bodyMetrics(page);
  expect(metrics.scrollLeft).toBeLessThan(0);

  const bounds = await cellBounds(page, 0, COLUMN_COUNT - 1);
  expect(bounds).not.toBeNull();
  const scrollerBox = await bodyScroller(page).boundingBox();
  if (scrollerBox === null) throw new Error("Body scroller is not measurable.");
  const target = mirror(scrollerBox, bounds!);
  expect(target.left).toBeGreaterThanOrEqual(scrollerBox.x - TOLERANCE);
  expect(target.right).toBeLessThanOrEqual(scrollerBox.x + scrollerBox.width + TOLERANCE);
  await expectAligned(page, COLUMN_COUNT);
  expect(pageErrors).toEqual([]);
});

test("touch scrolling keeps the inline position across a direction change", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await useRtl(page);

  // A scaled grid where synthetic touch scrolling takes over the gestures.
  await page.getByTestId("use-large-columnar").click();
  await expect.poll(() => bodyScroller(page).evaluate((element) => element.style.touchAction))
    .toBe("none");

  const swipe = async (): Promise<number> =>
    bodyScroller(page).evaluate(async (element) => {
      const frame = (): Promise<void> =>
        new Promise((resolve) => requestAnimationFrame(() => resolve()));
      const send = (type: string, y: number): void => {
        const touches = [{ identifier: 1, clientX: 200, clientY: y }];
        element.dispatchEvent(
          Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
            touches,
            changedTouches: touches,
          }),
        );
      };
      send("touchstart", 250);
      send("touchmove", 210);
      await frame();
      await frame();
      send("touchcancel", 210);
      await frame();
      return element.scrollLeft;
    });

  await bodyScroller(page).evaluate((element) => {
    element.scrollLeft = -100;
  });
  await expect.poll(() => bodyScroller(page).evaluate((element) => element.scrollLeft)).toBe(-100);
  expect(await swipe()).toBe(-100);

  // Flip the live host to LTR and resize it: the wrapper resamples direction
  // and must drop the synthetic bridge's cache, or the next swipe reports the
  // negated position and core corrects the horizontal scroll back to zero.
  await page.getByTestId("grid-host").evaluate((element) => {
    element.dir = "ltr";
    element.style.width = "650px";
  });
  await expect.poll(() => bodyScroller(page).evaluate((element) => element.clientWidth)).toBe(650);
  await bodyScroller(page).evaluate(async (element) => {
    element.scrollLeft = 100;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  expect(await swipe()).toBe(100);
  expect(pageErrors).toEqual([]);
});

test("a resize drag toward the inline end grows the column", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await useRtl(page);

  const width = async (): Promise<number> => {
    const box = await cell(page, 0, 1).boundingBox();
    if (box === null) throw new Error("Column is not measurable.");
    return box.width;
  };
  const dragHandle = async (delta: number): Promise<void> => {
    const handle = headerCell(page, 1).locator(".gp-grid-header-resize-handle");
    const box = await handle.boundingBox();
    if (box === null) throw new Error("Resize handle is not measurable.");
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + delta, y, { steps: 4 });
    await page.mouse.up();
  };

  const before = await width();
  // The handle sits on the cell's inline end, which is its physical left edge.
  await dragHandle(-60);
  await expect.poll(width).toBe(before + 60);
  await dragHandle(60);
  await expect.poll(width).toBe(before);
  expect(pageErrors).toEqual([]);
});

test("the fill handle sits at the cell's inline-end corner", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await useRtl(page);

  await cell(page, 0, 1).click();
  const handle = page.locator(".gp-grid-fill-handle");
  await expect(handle).toHaveCount(1);

  const cellBox = await cell(page, 0, 1).boundingBox();
  const handleBox = await handle.boundingBox();
  if (cellBox === null || handleBox === null) throw new Error("Element is not measurable.");
  // The handle's inline-start edge is its physical right edge in RTL, and it
  // is inset from the cell's inline end, which is the physical left edge.
  expect(Math.abs(handleBox.x + handleBox.width - (cellBox.x + HANDLE_INSET)))
    .toBeLessThanOrEqual(TOLERANCE);
  expect(handleBox.x).toBeGreaterThanOrEqual(cellBox.x - TOLERANCE);
  expect(handleBox.x + handleBox.width).toBeLessThanOrEqual(cellBox.x + cellBox.width + TOLERANCE);
  expect(pageErrors).toEqual([]);
});
