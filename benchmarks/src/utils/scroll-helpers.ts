// Scroll simulation helpers for benchmarking

import type { Page } from "@playwright/test";

export interface ScrollOptions {
  duration: number; // Total duration in ms
  distance: number; // Total distance to scroll in pixels
}

export interface ScrollResult {
  startPosition: number;
  endPosition: number;
  actualDelta: number;
  durationMs: number;
}

// Smart.Grid renders a custom scrollbar rather than relying on native overflow.
// Setting scrollTop on its <smart-grid> host does not move the virtual viewport
// and forces an expensive synchronous reflow across the full 1M-row canvas on
// every step (the scroll loop never finishes within the test budget). These
// optional methods are its documented programmatic scroll API. This type is
// erased at runtime, so it is safe to reference inside page.evaluate callbacks
// (unlike module-scope functions, which do not exist in the browser context).
type SmartGridElement = Element & {
  setVerticalScrollValue?: (value: number) => void;
  getVerticalScrollValue?: () => number;
  getVerticalScrollMax?: () => number;
};

// Perform smooth continuous programmatic scroll. This is useful for memory stress
// tests, but user-facing scroll performance should use wheel input.
export async function performProgrammaticScroll(
  page: Page,
  options: ScrollOptions
): Promise<void> {
  const { duration, distance } = options;
  const steps = Math.ceil(duration / 16); // ~60fps
  const stepDistance = distance / steps;
  const stepDuration = duration / steps;

  await page.evaluate(
    async ({ steps, stepDistance, stepDuration }) => {
      const container = document.querySelector(
        '[data-testid="grid-container"]'
      );
      if (!container) return;

      // Smart.Grid: drive its scroll API; native scrollTop hangs on 1M rows.
      const smartGrid = container.querySelector(
        "smart-grid"
      ) as SmartGridElement | null;
      if (smartGrid?.setVerticalScrollValue) {
        for (let i = 0; i < steps; i++) {
          const current = smartGrid.getVerticalScrollValue?.() ?? 0;
          smartGrid.setVerticalScrollValue(current + stepDistance);
          await new Promise((r) => setTimeout(r, stepDuration));
        }
        return;
      }

      // Find the native scrollable element (varies by library)
      // See getScrollPosition: pick the largest-overflow child, not the first,
      // so the header's 1px sub-pixel overflow does not shadow the scroll body.
      const gpContainer = container.querySelector(".gp-grid-container");
      const gpBody = gpContainer
        ? Array.from(gpContainer.children)
            .filter((child) => child.scrollHeight > child.clientHeight)
            .sort(
              (a, b) =>
                b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight),
            )[0]
        : null;
      const scrollable =
        container.querySelector(".ag-body-viewport") || // AG Grid
        container.querySelector(".wtHolder") ||         // Handsontable
        gpBody ||                                       // gp-grid (unclassed scroll body)
        container;                                       // TanStack (container itself)

      for (let i = 0; i < steps; i++) {
        scrollable.scrollTop += stepDistance;
        await new Promise((r) => setTimeout(r, stepDuration));
      }
    },
    { steps, stepDistance, stepDuration }
  );
}

// Scroll to a specific position
export async function scrollToPosition(
  page: Page,
  scrollTop: number
): Promise<void> {
  await page.evaluate((top) => {
    const container = document.querySelector('[data-testid="grid-container"]');
    if (!container) return;

    const smartGrid = container.querySelector(
      "smart-grid"
    ) as SmartGridElement | null;
    if (smartGrid?.setVerticalScrollValue) {
      smartGrid.setVerticalScrollValue(top);
      return;
    }

    // gp-grid's scroll body is the unclassed overflow:auto child of the
    // container. Pick the child with the largest vertical overflow: the header
    // can report a 1px sub-pixel overflow, so "first child that overflows" would
    // wrongly select it (and its scrollTop never moves).
    const gpContainer = container.querySelector(".gp-grid-container");
    const gpBody = gpContainer
      ? Array.from(gpContainer.children)
          .filter((child) => child.scrollHeight > child.clientHeight)
          .sort(
            (a, b) =>
              b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight),
          )[0]
      : null;
    const scrollable =
      container.querySelector(".ag-body-viewport") ||
      container.querySelector(".wtHolder") ||
      gpBody ||
      container;

    scrollable.scrollTop = top;
  }, scrollTop);
}

// Scroll to top
export async function scrollToTop(page: Page): Promise<void> {
  await scrollToPosition(page, 0);
}

// Scroll to bottom
export async function scrollToBottom(page: Page): Promise<void> {
  await page.evaluate(() => {
    const container = document.querySelector('[data-testid="grid-container"]');
    if (!container) return;

    const smartGrid = container.querySelector(
      "smart-grid"
    ) as SmartGridElement | null;
    if (smartGrid?.setVerticalScrollValue) {
      smartGrid.setVerticalScrollValue(smartGrid.getVerticalScrollMax?.() ?? 0);
      return;
    }

    // gp-grid's scroll body is the unclassed overflow:auto child of the
    // container. Pick the child with the largest vertical overflow: the header
    // can report a 1px sub-pixel overflow, so "first child that overflows" would
    // wrongly select it (and its scrollTop never moves).
    const gpContainer = container.querySelector(".gp-grid-container");
    const gpBody = gpContainer
      ? Array.from(gpContainer.children)
          .filter((child) => child.scrollHeight > child.clientHeight)
          .sort(
            (a, b) =>
              b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight),
          )[0]
      : null;
    const scrollable =
      container.querySelector(".ag-body-viewport") ||
      container.querySelector(".wtHolder") ||
      gpBody ||
      container;

    scrollable.scrollTop = scrollable.scrollHeight;
  });
}

// The measured scroll reports its travel in logical (content) pixels so rows
// traversed is comparable across grids. Most grids scroll natively (logical ==
// DOM scrollTop) and Smart.Grid's scroll API already reports virtual pixels;
// gp-grid is the only grid whose DOM scroll space is compressed (ratio < 1) at
// large row counts, so its DOM position is divided by the ratio to recover the
// logical travel.
async function getLogicalScrollPosition(page: Page): Promise<number> {
  const domPosition = await getScrollPosition(page);
  const ratio = await page.evaluate(
    () => window.gridApi.getScrollRatio?.() ?? 1,
  );
  return domPosition / ratio;
}

// Perform scroll with wheel events. This is the measured scroll for EVERY grid:
// all grids receive the identical wheel input, and how far each one actually
// travels under it (custom scrollbars and dampened wheel handling rescale the
// deltas) is reported via actualDelta rather than being equalized.
export async function performWheelScroll(
  page: Page,
  options: ScrollOptions
): Promise<ScrollResult> {
  const { duration, distance } = options;
  const steps = Math.ceil(duration / 16);
  const deltaY = distance / steps;
  const stepDuration = duration / steps;
  const startPosition = await getLogicalScrollPosition(page);
  const startedAt = Date.now();

  const container = await page.$('[data-testid="grid-container"]');
  if (!container) {
    return {
      startPosition,
      endPosition: startPosition,
      actualDelta: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  const box = await container.boundingBox();
  if (!box) {
    return {
      startPosition,
      endPosition: startPosition,
      actualDelta: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  // Position mouse over the grid
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  await page.mouse.move(centerX, centerY);

  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, deltaY);
    await page.waitForTimeout(stepDuration);
  }

  const endPosition = await getLogicalScrollPosition(page);

  return {
    startPosition,
    endPosition,
    actualDelta: endPosition - startPosition,
    durationMs: Date.now() - startedAt,
  };
}

// Get current scroll position
export async function getScrollPosition(page: Page): Promise<number> {
  return page.evaluate(() => {
    const container = document.querySelector('[data-testid="grid-container"]');
    if (!container) return 0;

    const smartGrid = container.querySelector(
      "smart-grid"
    ) as SmartGridElement | null;
    if (smartGrid?.getVerticalScrollValue) {
      return smartGrid.getVerticalScrollValue();
    }

    // gp-grid's scroll body is the unclassed overflow:auto child of the
    // container. Pick the child with the largest vertical overflow: the header
    // can report a 1px sub-pixel overflow, so "first child that overflows" would
    // wrongly select it (and its scrollTop never moves).
    const gpContainer = container.querySelector(".gp-grid-container");
    const gpBody = gpContainer
      ? Array.from(gpContainer.children)
          .filter((child) => child.scrollHeight > child.clientHeight)
          .sort(
            (a, b) =>
              b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight),
          )[0]
      : null;
    const scrollable =
      container.querySelector(".ag-body-viewport") ||
      container.querySelector(".wtHolder") ||
      gpBody ||
      container;

    return scrollable.scrollTop;
  });
}

// Get scroll height
export async function getScrollHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    const container = document.querySelector('[data-testid="grid-container"]');
    if (!container) return 0;

    const smartGrid = container.querySelector(
      "smart-grid"
    ) as SmartGridElement | null;
    if (smartGrid?.getVerticalScrollMax) {
      return smartGrid.getVerticalScrollMax();
    }

    // gp-grid's scroll body is the unclassed overflow:auto child of the
    // container. Pick the child with the largest vertical overflow: the header
    // can report a 1px sub-pixel overflow, so "first child that overflows" would
    // wrongly select it (and its scrollTop never moves).
    const gpContainer = container.querySelector(".gp-grid-container");
    const gpBody = gpContainer
      ? Array.from(gpContainer.children)
          .filter((child) => child.scrollHeight > child.clientHeight)
          .sort(
            (a, b) =>
              b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight),
          )[0]
      : null;
    const scrollable =
      container.querySelector(".ag-body-viewport") ||
      container.querySelector(".wtHolder") ||
      gpBody ||
      container;

    return scrollable.scrollHeight;
  });
}
