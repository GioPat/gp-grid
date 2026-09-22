// benchmarks/conformance/helpers.ts
// Shared helpers for the conformance suites. Extracted from the flat-grid spec
// so both suites use one fixture/probe vocabulary.

import { expect, type Locator, type Page } from "@playwright/test";

/** Tolerance for every cross-surface comparison in the conformance suites. */
export const TOLERANCE = 1;

export const bodyScroller = (page: Page): Locator =>
  page.locator(".gp-grid-rows-wrapper").locator("xpath=../..");

export const headerCell = (page: Page, layoutIndex: number): Locator =>
  page.locator(`.gp-grid-header-cell[data-col-index="${layoutIndex}"]`);

export const cell = (page: Page, row: number, layoutIndex: number): Locator =>
  page.locator(`[data-cell-row="${row}"][data-cell-col="${layoutIndex}"]`);

export interface LayoutColumnSnapshot {
  columnId: string;
  layoutIndex: number;
  offset: number;
  width: number;
}

export const layoutColumns = (page: Page): Promise<LayoutColumnSnapshot[]> =>
  readHook<LayoutColumnSnapshot[]>(page, "layoutColumns");

/** Box of a mounted element, or `null` when the wrapper did not mount it. */
export const mountedBox = async (
  locator: Locator,
): Promise<{ x: number; width: number } | null> => {
  // `boundingBox()` waits for the element, so an unmounted column must be
  // detected by count first.
  if ((await locator.count()) === 0) return null;
  const box = await locator.boundingBox();
  return box === null ? null : { x: box.x, width: box.width };
};

/**
 * Header and first-row cell agree on x and width, and match the snapshot.
 * A wrapper mounts only its column window, so unmounted columns are skipped.
 */
export const expectAligned = async (page: Page, expectedCount: number): Promise<void> => {
  // The layout trails a mutation by a frame or two, so the count is polled too.
  await expect.poll(async () => (await layoutColumns(page)).length).toBe(expectedCount);
  const columns = await layoutColumns(page);

  await expect
    .poll(async () => {
      let mounted = 0;
      for (const column of columns) {
        const headerBox = await mountedBox(headerCell(page, column.layoutIndex));
        const cellBox = await mountedBox(cell(page, 0, column.layoutIndex));
        if (headerBox === null || cellBox === null) continue;
        mounted += 1;
        if (Math.abs(headerBox.x - cellBox.x) > TOLERANCE) {
          return `column ${column.layoutIndex}: header x ${headerBox.x} vs cell x ${cellBox.x}`;
        }
        if (Math.abs(headerBox.width - column.width) > TOLERANCE) {
          return `column ${column.layoutIndex}: header width ${headerBox.width} vs ${column.width}`;
        }
      }
      return mounted > 0 ? "aligned" : "no mounted column";
    })
    .toBe("aligned");
};

export const openFixture = async (page: Page, framework: string): Promise<Error[]> => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await page.goto("/?conformance=1");
  await expect(page.locator("[data-conformance-framework]")).toHaveAttribute("data-conformance-framework", framework);
  await expect(page.locator('[data-cell-row="0"][data-cell-col="1"]')).toContainText("Row 000");
  return pageErrors;
};

export const scrollMetrics = (page: Page): Promise<{ maxScroll: number; scrollTop: number }> =>
  page.locator(".gp-grid-rows-wrapper").evaluate((element) => {
    const scrollElement = element.parentElement?.parentElement;
    if (scrollElement === null || scrollElement === undefined) {
      return { maxScroll: 0, scrollTop: 0 };
    }
    return {
      maxScroll: scrollElement.scrollHeight - scrollElement.clientHeight,
      scrollTop: scrollElement.scrollTop,
    };
  });

export const scrollBody = async (page: Page, top: number, left: number): Promise<void> => {
  // The columnar query is asynchronous, so the virtual content height may not
  // be established yet. Scrolling before then makes the browser clamp scrollTop
  // back to 0, so wait until the requested offset is reachable.
  await expect.poll(async () => (await scrollMetrics(page)).maxScroll).toBeGreaterThanOrEqual(top);
  await page.locator(".gp-grid-rows-wrapper").evaluate((element, position) => {
    const scrollElement = element.parentElement?.parentElement;
    if (scrollElement === null || scrollElement === undefined) {
      throw new Error("Unable to locate the grid scroll element.");
    }
    scrollElement.scrollTo({ top: position.top, left: position.left });
    scrollElement.dispatchEvent(new Event("scroll"));
  }, { top, left });
  await expect.poll(async () => (await scrollMetrics(page)).scrollTop).toBeGreaterThanOrEqual(top);
};

/** Switch the shared fixture to its read-only columnar source. */
export const useColumnar = async (page: Page, framework: string): Promise<Error[]> => {
  const pageErrors = await openFixture(page, framework);
  await page.getByTestId("use-columnar").click();
  await expect(page.locator('[data-cell-row="0"][data-cell-col="1"]')).toContainText("Row 000");
  return pageErrors;
};

export const readRawCell = (page: Page, row: number, col: number): Promise<unknown> =>
  page.evaluate(
    ({ row: targetRow, col: targetCol }) => {
      const hooks = (globalThis as unknown as {
        __gpConformance?: { getCellValue: (row: number, col: number) => unknown };
      }).__gpConformance;
      return hooks?.getCellValue(targetRow, targetCol) ?? null;
    },
    { row, col },
  );

/** Call a zero-argument conformance hook exposed by the shared fixtures. */
export const readHook = <T>(page: Page, name: string): Promise<T> =>
  page.evaluate((hookName) => {
    const hooks = (globalThis as unknown as {
      __gpConformance?: Record<string, () => unknown>;
    }).__gpConformance;
    return hooks?.[hookName]?.() ?? null;
  }, name) as Promise<T>;

export interface ColumnStateSnapshot {
  columnId: string;
  /** Present only while an explicit pixel override exists. */
  width?: number;
  /** Displayed width in CSS px, `0` while hidden. */
  resolvedWidth: number;
  hidden: boolean;
  order: number;
  /** Requested pin, or `null` while unpinned. */
  pinned: "start" | "end" | null;
  /** Effective region, or `null` while hidden. */
  region: "start" | "center" | "end" | null;
}

export const coreToken = (page: Page): Promise<number> => readHook<number>(page, "coreToken");
export const sortColumn = (page: Page): Promise<string | null> => readHook<string | null>(page, "sortColumn");
export const filterCount = (page: Page): Promise<number> => readHook<number>(page, "filterCount");
export const columnState = (page: Page): Promise<ColumnStateSnapshot[]> =>
  readHook<ColumnStateSnapshot[]>(page, "columnState");
export const columnIds = (page: Page): Promise<string[]> => readHook<string[]>(page, "columnIds");
export const eventCounts = (page: Page): Promise<{ resized: number; moved: number; dragged: number; pinned: number }> =>
  readHook<{ resized: number; moved: number; dragged: number; pinned: number }>(page, "eventCounts");
export const resetEventCounts = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const hooks = (globalThis as unknown as {
      __gpConformance?: { resetEventCounts?: () => void };
    }).__gpConformance;
    hooks?.resetEventCounts?.();
  });

export const cityWidth = async (page: Page): Promise<number> => {
  const state = await columnState(page);
  return state.find((entry) => entry.columnId === "city")?.resolvedWidth ?? -1;
};

// Columnar fixture shape, mirrored from the three conformance apps.
export const COLUMNAR_ROW_COUNT = 200;
export const COLUMNAR_COLUMN_COUNT = 8;

export type CounterName =
  | "sourceReads"
  | "sourceDistinctRows"
  | "recordMaterializations";

export const readCounter = (page: Page, name: CounterName): Promise<number> =>
  page.evaluate((counterName) => {
    const hooks = (globalThis as unknown as {
      __gpConformance?: Record<string, () => number>;
    }).__gpConformance;
    return hooks?.[counterName]?.() ?? -1;
  }, name);

export const resetSourceReads = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const hooks = (globalThis as unknown as {
      __gpConformance?: { resetSourceReads?: () => void };
    }).__gpConformance;
    hooks?.resetSourceReads?.();
  });

/**
 * A wrapper that eagerly read every source row would touch all
 * `COLUMNAR_ROW_COUNT` rows; a mounted-window read stays far below that.
 */
export const assertBoundedSourceReads = async (page: Page): Promise<void> => {
  const reads = await readCounter(page, "sourceReads");
  const distinctRows = await readCounter(page, "sourceDistinctRows");
  expect(distinctRows).toBeGreaterThan(0);
  expect(distinctRows).toBeLessThan(COLUMNAR_ROW_COUNT);
  expect(reads).toBeLessThan(COLUMNAR_ROW_COUNT * COLUMNAR_COLUMN_COUNT);
  expect(await readCounter(page, "recordMaterializations")).toBe(0);
};

