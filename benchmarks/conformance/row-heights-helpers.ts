// benchmarks/conformance/row-heights-helpers.ts
// Fixture vocabulary for the row-height suites (PRD 006): arming, the readers
// and the row-box sampler.

import { expect, type Page } from "@playwright/test";
import { headerRowCount, openFixture, readHook } from "./helpers";
import {
  bodyMetrics,
  rowRegions,
  scroller,
  waitForScroll,
  type RequestedRange,
  type RowBox,
  type RowRegionsView,
} from "./frozen-rows-helpers";

/** Slice 1 recipe: 32 px rows, 36 px header. */
export const ROW_HEIGHT = 32;
export const HEADER_HEIGHT = 36;
export const PAGE_SIZE = 100;
/** The paged arm's override: it waits for a page far below the first window. */
export const PAGED_ID = 5000;
/** AC-006-04 growth: one row grows by 80 px above the viewport. */
export const GROWTH = 80;
/** The frozen control grows the three-row band by 64. */
export const FROZEN_BAND_GROWTH = 64;
/** The large arm's last row, 480 px tall. */
export const LAST_INDEX = 999_999;

export type RowHeightsArm = "object" | "large" | "paged";

const PRESET_COUNTS: Record<RowHeightsArm, number> = { object: 0, large: 3, paged: 1 };
const ARM_TEST_IDS: Record<RowHeightsArm, string> = {
  object: "use-row-heights",
  large: "use-row-heights-large",
  paged: "use-row-heights-paged",
};

export interface RowHeightOverride {
  rowId: number | string;
  height: number;
}

export interface AxisBoundsSnapshot {
  start: number;
  end: number;
}

/** One mounted row box with its cells, relative to the scroller's client area. */
export interface RowBoxSample extends RowBox {
  cellHeights: number[];
}

export const armRowHeights = async (
  page: Page,
  framework: string,
  arm: RowHeightsArm,
): Promise<Error[]> => {
  const pageErrors = await openFixture(page, framework);
  await page.getByTestId(ARM_TEST_IDS[arm]).click();
  await expect.poll(async () => (await mountedRows(page)).length).toBeGreaterThan(0);
  // The arm's preset runs against the core the remount created.
  await expect.poll(async () => (await rowHeightOverrides(page)).length).toBe(PRESET_COUNTS[arm]);
  return pageErrors;
};

/** Every mounted row box, with the heights of the cells it holds. */
export const mountedRows = async (page: Page): Promise<RowBoxSample[]> =>
  scroller(page).evaluate((element, headerRows) => {
    const origin = element.getBoundingClientRect().top + element.clientTop;
    const block = element.querySelector(".gp-grid-frozen-rows");
    return Array.from(element.querySelectorAll<HTMLElement>(".gp-grid-row")).map((row) => {
      const box = row.getBoundingClientRect();
      return {
        index: Number(row.getAttribute("aria-rowindex")) - headerRows - 1,
        frozen: block !== null && block.contains(row),
        top: box.top - origin,
        height: box.height,
        cellHeights: Array.from(row.querySelectorAll<HTMLElement>(".gp-grid-cell")).map(
          (cell) => cell.getBoundingClientRect().height,
        ),
      };
    });
  }, await headerRowCount(page));

export const boxAt = async (page: Page, viewIndex: number): Promise<RowBoxSample | null> =>
  (await mountedRows(page)).find((row) => row.index === viewIndex) ?? null;

/** Height of the content sizer, the DOM half of the axis extent. */
export const sizerHeight = (page: Page): Promise<number> =>
  scroller(page).evaluate((element) => {
    const sizer = element.firstElementChild;
    return sizer === null ? 0 : sizer.getBoundingClientRect().height;
  });

/**
 * Scroll to the browser's own maximum: assigning `scrollHeight` lets it clamp,
 * so DOM rounding cannot leave the sample a pixel short of the end.
 */
export const scrollToEnd = async (page: Page): Promise<void> => {
  await scroller(page).evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect.poll(async () => {
    const metrics = await bodyMetrics(page);
    return metrics.maxScroll - metrics.scrollTop;
  }).toBeLessThanOrEqual(2);
};

export const rowHeightOverrides = (page: Page): Promise<RowHeightOverride[]> =>
  readHook<RowHeightOverride[]>(page, "rowHeightOverrides");

/** Axis extent, the measure a compressed arm still reports in full. */
export const contentSize = (page: Page): Promise<{ width: number; height: number } | null> =>
  readHook<{ width: number; height: number } | null>(page, "contentSize");

export const requestedRanges = (page: Page): Promise<RequestedRange[]> =>
  readHook<RequestedRange[]>(page, "requestedRanges");

export const firstVisibleRow = (page: Page): Promise<number> =>
  readHook<number>(page, "firstVisibleRow");

export const rowBounds = (
  page: Page,
  viewIndex: number,
  space: "content" | "viewport" | "rows" = "viewport",
): Promise<AxisBoundsSnapshot | null> =>
  page.evaluate(
    ({ index, targetSpace }) => {
      const hooks = (globalThis as unknown as {
        __gpConformance?: {
          rowBounds?: (viewIndex: number, space?: string) => AxisBoundsSnapshot | null;
        };
      }).__gpConformance;
      return hooks?.rowBounds?.(index, targetSpace) ?? null;
    },
    { index: viewIndex, targetSpace: space },
  );

/** Core row size, or `-1` outside the axis. */
export const rowHeightAt = async (page: Page, viewIndex: number): Promise<number> => {
  const bounds = await rowBounds(page, viewIndex, "content");
  return bounds === null ? -1 : bounds.end - bounds.start;
};

export const waitForHeight = (page: Page, viewIndex: number, height: number): Promise<void> =>
  expect.poll(async () => rowHeightAt(page, viewIndex)).toBe(height);

/** Every mounted box sits on the core bounds, cells included (AC-006-01). */
export const expectRowsOnCoreBounds = async (page: Page, tolerance: number): Promise<void> => {
  const rows = await mountedRows(page);
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    const bounds = await rowBounds(page, row.index, "viewport");
    if (bounds === null) throw new Error(`row ${row.index} has no bounds`);
    expect(Math.abs(row.top - bounds.start)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(row.height - (bounds.end - bounds.start))).toBeLessThanOrEqual(tolerance);
    for (const cellHeight of row.cellHeights) {
      expect(Math.abs(cellHeight - row.height)).toBeLessThanOrEqual(tolerance);
    }
  }
};

/**
 * The `swipeBand` dispatch pattern pointed at the first mounted row: the
 * first move is absorbed by the tap slop, so the second one carries `dy`.
 */
export const swipeRows = async (page: Page, dy: number): Promise<void> => {
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
    const start = args.startY;
    send("touchstart", start);
    send("touchmove", start - args.slop);
    await frame();
    send("touchmove", start - args.slop - args.dy);
    await frame();
    await frame();
    send("touchcancel", start - args.slop - args.dy);
    await frame();
  }, { x: box.x + box.width / 2, startY: box.y + box.height - 4, slop: 20, dy });
};

export { bodyMetrics, rowRegions, waitForScroll };
export type { RowRegionsView };
