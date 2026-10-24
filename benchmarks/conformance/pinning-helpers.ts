// benchmarks/conformance/pinning-helpers.ts
// Fixture vocabulary shared by the pinning suites. Extracted so each spec file
// stays within its budget.

import { expect, type Page } from "@playwright/test";
import { bodyScroller, readHook } from "./helpers";

export const COLUMN_COUNT = 8;
export const WIDE_COUNT = 1_000;
export const FAR_COUNT = 10_000;
/** Core default; the fixtures do not override it. */
export const COLUMN_OVERSCAN = 240;
/** Narrowest width in the wide fixture, so the largest possible bound. */
export const MIN_WIDE_WIDTH = 80;

export interface ColumnWindowView {
  range: { start: number; end: number };
  start: string[];
  center: string[];
  end: string[];
  regions: {
    centerStart: number;
    centerEnd: number;
    startWidth: number;
    endWidth: number;
    endOffset: number;
    centerViewportWidth: number;
  };
  displayedCount: number;
}

export interface ClientBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const columnWindow = (page: Page): Promise<ColumnWindowView | null> =>
  readHook<ColumnWindowView | null>(page, "columnWindow");

export const activeCell = (page: Page): Promise<{ row: number; col: number } | null> =>
  readHook<{ row: number; col: number } | null>(page, "activeCell");

export const selectionRange =
  (page: Page): Promise<{ startRow: number; startCol: number; endRow: number; endCol: number } | null> =>
    readHook(page, "selectionRange");

const callHook = (page: Page, name: string, arg: unknown): Promise<void> =>
  page.evaluate(
    ({ hookName, hookArg }) => {
      const hooks = (globalThis as unknown as {
        __gpConformance?: Record<string, (value: unknown) => void>;
      }).__gpConformance;
      hooks?.[hookName]?.(hookArg);
    },
    { hookName: name, hookArg: arg },
  );

/** Switch the fixture to `count` deterministic unequal-width columns. */
export const useWideColumns = async (page: Page, count: number): Promise<void> => {
  await callHook(page, "useWideColumns", count);
  await expect.poll(() => page.locator(".gp-grid-header-cell").count()).toBeGreaterThan(0);
  await expect.poll(async () => (await columnWindow(page))?.displayedCount ?? 0).toBe(count);
};

/** Activate a far column and scroll it into view, as a consumer would. */
export const activateCell = (page: Page, row: number, layoutIndex: number): Promise<void> =>
  page.evaluate(
    ({ targetRow, targetCol }) => {
      const hooks = (globalThis as unknown as {
        __gpConformance?: { activateCell?: (row: number, col: number) => void };
      }).__gpConformance;
      hooks?.activateCell?.(targetRow, targetCol);
    },
    { targetRow: row, targetCol: layoutIndex },
  );

/** The body's client box, the coordinate space every viewport x is relative to. */
export const clientBox = (page: Page): Promise<ClientBox> =>
  bodyScroller(page).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left + element.clientLeft,
      top: rect.top + element.clientTop,
      width: element.clientWidth,
      height: element.clientHeight,
    };
  });

export const bodyWidth = async (page: Page): Promise<number> => (await clientBox(page)).width;

export const hostDir = async (page: Page): Promise<"ltr" | "rtl"> => {
  const dir = await page.getByTestId("grid-host").getAttribute("dir");
  return dir === "rtl" ? "rtl" : "ltr";
};

export const resizeHost = async (page: Page, width: number): Promise<void> => {
  await page.getByTestId("grid-host").evaluate((element, target) => {
    (element as HTMLElement).style.width = `${target}px`;
  }, width);
};

export const pinColumns = (page: Page): Promise<void> => page.getByTestId("pin-columns").click();

export const expectPinCount = async (page: Page, start: number, end: number): Promise<void> => {
  await expect(page.locator('.gp-grid-pin-header[data-pin-region="start"] .gp-grid-header-cell'))
    .toHaveCount(start);
  await expect(page.locator('.gp-grid-pin-header[data-pin-region="end"] .gp-grid-header-cell'))
    .toHaveCount(end);
};

export const remountTo = async (page: Page, dir: "ltr" | "rtl"): Promise<void> => {
  if (await hostDir(page) === dir) return;
  await page.getByTestId("toggle-rtl").click();
  await expect(page.getByTestId("grid-host")).toHaveAttribute("dir", dir);
  await expect.poll(() => page.locator(".gp-grid-header-cell").count()).toBeGreaterThan(0);
};

/** Screen box of the first mounted row's start pin container. */
export const startPinBox = async (page: Page): Promise<{ x: number; width: number }> => {
  const box = await page.locator(".gp-grid-rows-wrapper .gp-grid-pin--start").first().boundingBox();
  if (box === null) throw new Error("Start pin is not measurable.");
  return { x: box.x, width: box.width };
};
