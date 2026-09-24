// benchmarks/conformance/frozen-rows-helpers.ts
// Fixture vocabulary for the frozen-row suites (PRD 005). Extracted so both
// specs stay within their budget.

import { expect, type Locator, type Page } from "@playwright/test";
import { openFixture, readHook, TOLERANCE } from "./helpers";

/** Slice 1 recipe: 8 x 100 px columns, 32 px rows, 36 px header, 1M rows. */
export const FROZEN_COUNT = 3;
export const ROW_HEIGHT = 32;
export const BLOCK_HEIGHT = FROZEN_COUNT * ROW_HEIGHT;
export const PAGE_SIZE = 100;
export const CONTENT_WIDTH = 800;
export const SAMPLE_ROW_COUNT = 1_000_000;

export interface FrozenRowsView {
  requestedCount: number;
  effectiveCount: number;
  limit: "maxCount" | "cache" | "viewport" | null;
}

export interface RowRegionsView {
  frozenCount: number;
  frozenExtent: number;
  suffixViewportHeight: number;
  frozen: FrozenRowsView;
}

export interface RequestedRange {
  startRow: number;
  endRow: number;
}

export interface RowBox {
  index: number;
  frozen: boolean;
  top: number;
  height: number;
}

export interface BodyMetrics {
  scrollTop: number;
  scrollLeft: number;
  maxScroll: number;
  maxScrollLeft: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
}

export const rowRegions = (page: Page): Promise<RowRegionsView | null> =>
  readHook<RowRegionsView | null>(page, "rowRegions");

export const frozenRows = (page: Page): Promise<FrozenRowsView | null> =>
  readHook<FrozenRowsView | null>(page, "frozenRows");

export const announcement = (page: Page): Promise<{ message: string; revision: number } | null> =>
  readHook<{ message: string; revision: number } | null>(page, "announcement");

export const requestedRanges = (page: Page): Promise<RequestedRange[]> =>
  readHook<RequestedRange[]>(page, "requestedRanges");

/** Withhold rows 0-2 from the next prefix response, for the C7 placeholder. */
export const holdFrozenRows = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const hooks = (globalThis as unknown as {
      __gpConformance?: { holdFrozenRows?: () => void };
    }).__gpConformance;
    hooks?.holdFrozenRows?.();
  });

/**
 * C12: change the count through the fixture's core setter. A real button click
 * focuses the button and the shipped blur rule commits the open draft, so an
 * edit-rule case would never reach the freeze path.
 */
export const setFreezeCount = (page: Page, count: number): Promise<void> =>
  page.evaluate((value) => {
    const hooks = (globalThis as unknown as {
      __gpConformance?: { setFreezeCount?: (count: number) => void };
    }).__gpConformance;
    hooks?.setFreezeCount?.(value);
  }, count);

/** The body scroller; the frozen block adds a second `.gp-grid-rows-wrapper`. */
export const scroller = (page: Page): Locator => page.locator(".gp-grid-body-scroll");

export const frozenBlock = (page: Page): Locator => page.locator(".gp-grid-frozen-rows");

export const frozenPinLayer = (page: Page): Locator => page.locator(".gp-grid-frozen-pins");

export const frozenCell = (page: Page, row: number, column: number): Locator =>
  page.locator(
    `.gp-grid-frozen-rows [data-cell-row="${row}"][data-cell-col="${column}"],` +
    `.gp-grid-frozen-pins [data-cell-row="${row}"][data-cell-col="${column}"]`,
  );

/** Reference box: the grid's own 004 pin container of the first suffix row. */
export const gridPinBox = async (
  page: Page,
  region: "start" | "end",
): Promise<{ x: number; width: number }> => {
  const box = await page.locator(`.gp-grid-rows-wrapper .gp-grid-pin--${region}`).first().boundingBox();
  if (box === null) throw new Error(`${region} grid pin is not measurable.`);
  return { x: box.x, width: box.width };
};

export const frozenPinBox = async (
  page: Page,
  region: "start" | "end",
): Promise<{ x: number; y: number; width: number }> => {
  const box = await frozenPinLayer(page)
    .locator(`.gp-grid-pin--${region}`)
    .first()
    .boundingBox();
  if (box === null) throw new Error(`${region} frozen pin is not measurable.`);
  return { x: box.x, y: box.y, width: box.width };
};

export const bodyMetrics = (page: Page): Promise<BodyMetrics> =>
  scroller(page).evaluate((element) => ({
    scrollTop: element.scrollTop,
    scrollLeft: element.scrollLeft,
    maxScroll: element.scrollHeight - element.clientHeight,
    maxScrollLeft: element.scrollWidth - element.clientWidth,
    scrollHeight: element.scrollHeight,
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
  }));

export const activeCell = (page: Page): Promise<{ row: number; col: number } | null> =>
  readHook<{ row: number; col: number } | null>(page, "activeCell");

/** The block's box relative to the scroller's client area. */
export const blockBox = async (
  page: Page,
): Promise<{ top: number; left: number; width: number; height: number }> => {
  const box = await scroller(page).evaluate((element) => {
    const block = element.querySelector(".gp-grid-frozen-rows");
    if (block === null) return null;
    const elementBox = element.getBoundingClientRect();
    const blockBox = block.getBoundingClientRect();
    return {
      top: blockBox.top - elementBox.top - element.clientTop,
      left: blockBox.left - elementBox.left - element.clientLeft,
      width: blockBox.width,
      height: blockBox.height,
    };
  });
  if (box === null) throw new Error("Frozen block is not measurable.");
  return box;
};

/** One snapshot of every mounted row box, relative to the scroller's client area. */
export const mountedRows = (page: Page): Promise<RowBox[]> =>
  scroller(page).evaluate((element) => {
    const origin = element.getBoundingClientRect().top + element.clientTop;
    const block = element.querySelector(".gp-grid-frozen-rows");
    return Array.from(element.querySelectorAll<HTMLElement>(".gp-grid-row")).map((row) => {
      const box = row.getBoundingClientRect();
      return {
        // Rows carry the logical index as a 1-based `aria-rowindex`; the
        // `data-cell-row` attribute lives on the cells.
        index: Number(row.getAttribute("aria-rowindex")) - 1,
        frozen: block !== null && block.contains(row),
        top: box.top - origin,
        height: box.height,
      };
    });
  });

export const waitForScroll = async (page: Page, top: number, left: number): Promise<void> => {
  await expect.poll(async () => (await bodyMetrics(page)).maxScroll).toBeGreaterThanOrEqual(
    Math.max(top, 0),
  );
  await scroller(page).evaluate((element, position) => {
    element.scrollTo({ top: position.top, left: position.left });
    element.dispatchEvent(new Event("scroll"));
  }, { top, left });
  // A single read races the native scroll and reads the pre-scroll value, so
  // the position has to be observed twice before the sample is taken.
  let observed = 0;
  await expect
    .poll(async () => {
      const metrics = await bodyMetrics(page);
      observed = metrics.scrollTop === top && metrics.scrollLeft === left ? observed + 1 : 0;
      return observed;
    })
    .toBeGreaterThanOrEqual(2);
};

/** Every frozen row occupies exactly one `rowHeight` slot inside the band. */
export const expectFrozenBand = (rows: RowBox[]): void => {
  const frozen = rows.filter((row) => row.frozen);
  expect(frozen).toHaveLength(FROZEN_COUNT);
  for (const row of frozen) {
    expect(Math.abs(row.top - row.index * ROW_HEIGHT), `frozen row ${row.index}`)
      .toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(row.height - ROW_HEIGHT), `frozen row ${row.index} height`)
      .toBeLessThanOrEqual(TOLERANCE);
  }
};

/** The mounted suffix window is one contiguous run of `rowHeight` rows. */
export const expectSuffixRowGrid = (rows: RowBox[]): void => {
  const suffix = rows.filter((row) => row.frozen === false);
  expect(suffix.length).toBeGreaterThan(0);
  for (const row of suffix) {
    expect(Math.abs(row.height - ROW_HEIGHT), `row ${row.index} height`).toBeLessThanOrEqual(TOLERANCE);
  }
  const sorted = [...suffix].sort((a, b) => a.index - b.index);
  expect(sorted.map((row) => row.index)).toEqual(
    Array.from({ length: sorted.length }, (_, offset) => sorted[0]!.index + offset),
  );
};

/** Anchors the grid on the median mounted row, as the Slice 1 spike did. */
export const expectRowsOnGrid = (rows: RowBox[]): void => {
  const suffix = rows.filter((row) => row.frozen === false);
  const anchor = suffix[Math.floor(suffix.length / 2)]!;
  for (const row of suffix) {
    const expected = anchor.top + (row.index - anchor.index) * ROW_HEIGHT;
    expect(Math.abs(row.top - expected), `row ${row.index} top`).toBeLessThanOrEqual(TOLERANCE);
  }
};

/** The suffix window covers the clip below the band with no gap. */
export const expectSuffixCoversClip = (rows: RowBox[], clientHeight: number): void => {
  const suffix = rows.filter((row) => row.frozen === false);
  const top = Math.min(...suffix.map((row) => row.top));
  const bottom = Math.max(...suffix.map((row) => row.top + row.height));
  expect(top, "first suffix row starts at or above the band edge").toBeLessThanOrEqual(
    BLOCK_HEIGHT + TOLERANCE,
  );
  expect(bottom, "last suffix row reaches the clip bottom").toBeGreaterThanOrEqual(
    clientHeight - TOLERANCE,
  );
};

/** Whether the topmost element at a page point matches `selector`. */
export const hitsInside = (
  page: Page,
  point: { x: number; y: number },
  selector: string,
): Promise<boolean> =>
  page.evaluate((args) => {
    const hit = document.elementFromPoint(args.point.x, args.point.y);
    return hit !== null && hit.closest(args.selector) !== null;
  }, { point, selector });

/** Arm the columnar frozen fixture and wait for its band. */
export const armFreezeRows = async (page: Page, framework: string): Promise<Error[]> => {
  const pageErrors = await openFixture(page, framework);
  await page.getByTestId("use-freeze-rows").click();
  await expect(frozenBlock(page)).toHaveCount(1);
  await expect.poll(async () => (await rowRegions(page))?.frozenCount ?? 0).toBe(FROZEN_COUNT);
  await expect(frozenCell(page, 0, 1)).toHaveText("1");
  return pageErrors;
};

export const armFrozenPaged = async (page: Page, testId: string): Promise<void> => {
  await page.getByTestId(testId).click();
};

export const firstRequest = (ranges: RequestedRange[]): RequestedRange => {
  const first = ranges[0];
  if (first === undefined) throw new Error("The paginated fixture was never asked for a range.");
  return first;
};
