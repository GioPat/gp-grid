// benchmarks/conformance/scroll-motion.spec.ts
// A mouse press during a synthetic fling on a scaled grid only stops the fling;
// the next press acts normally. Runs in the react, vue and angular projects.

import { expect, test, type Page } from "@playwright/test";
import { activeCell, bodyMetrics, scroller, waitForScroll } from "./frozen-rows-helpers";
import { armRowHeights } from "./row-heights-helpers";

/** Mid-scroll offset inside the compressed range of the large arm. */
const COMPRESSED_TOP = 50_000;

/** A fast touch flick released while moving, so the grid's own fling takes over. */
const flingRows = async (page: Page, dy: number): Promise<void> => {
  const row = page.locator(".gp-grid-row").first();
  const box = await row.boundingBox();
  if (box === null) throw new Error("Row box is not measurable.");
  await row.evaluate(async (element, args) => {
    const frame = (): Promise<void> =>
      new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const send = (type: string, y: number): void => {
      const touches = [{ identifier: 1, clientX: args.x, clientY: y }];
      element.dispatchEvent(
        Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
          touches,
          changedTouches: touches,
        }),
      );
    };
    send("touchstart", args.startY);
    for (let step = 1; step <= 3; step += 1) {
      send("touchmove", args.startY - (args.dy * step) / 3);
      await frame();
    }
    send("touchend", args.startY - args.dy);
  }, { x: box.x + box.width / 2, startY: box.y + box.height - 4, dy });
};

const bodyCenter = async (page: Page): Promise<{ x: number; y: number }> => {
  const box = await scroller(page).boundingBox();
  if (box === null) throw new Error("Body is not measurable.");
  return { x: box.x + 40, y: box.y + box.height / 2 };
};

test("a click during a fling stops it and selects nothing", async ({ page }, testInfo) => {
  const pageErrors = await armRowHeights(page, testInfo.project.name, "large");
  await waitForScroll(page, COMPRESSED_TOP, 0);
  const before = await activeCell(page);
  const start = (await bodyMetrics(page)).scrollTop;
  const point = await bodyCenter(page);

  await flingRows(page, 300);
  await page.mouse.click(point.x, point.y);

  const stopped = (await bodyMetrics(page)).scrollTop;
  expect(stopped).toBeGreaterThan(start);
  await page.waitForTimeout(250);
  expect(Math.abs((await bodyMetrics(page)).scrollTop - stopped)).toBeLessThanOrEqual(1);
  expect(await activeCell(page)).toEqual(before);

  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => activeCell(page)).not.toEqual(before);
  expect(pageErrors).toEqual([]);
});
