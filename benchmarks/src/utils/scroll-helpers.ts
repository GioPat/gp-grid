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

export const performScroll = performProgrammaticScroll;

// Drive Smart.Grid's measured scroll through its own scroll API rather than the
// mouse wheel. Smart.Grid's custom scrollbar rescales wheel input to a fraction
// of the requested delta (~14%: it steps by a fixed line amount and ignores the
// event's magnitude), so a wheel-driven pass repaints far less canvas than the
// natively-scrolling grids and its FPS would be measured over a much shorter
// distance. Stepping setVerticalScrollValue at ~60fps covers the same virtual
// distance as the wheel path while still triggering a real repaint (and rAF
// frame) per step, keeping the FPS comparison over an equal scroll workload.
async function performSmartGridScroll(
  page: Page,
  options: ScrollOptions,
): Promise<ScrollResult> {
  const { duration, distance } = options;
  const steps = Math.ceil(duration / 16); // ~60fps
  const stepDistance = distance / steps;
  const stepDuration = duration / steps;
  const startedAt = Date.now();

  const positions = await page.evaluate(
    async ({ steps, stepDistance, stepDuration }) => {
      const container = document.querySelector('[data-testid="grid-container"]');
      const smartGrid = container?.querySelector(
        "smart-grid",
      ) as SmartGridElement | null;
      if (!smartGrid?.setVerticalScrollValue) {
        return { start: 0, end: 0 };
      }

      const start = smartGrid.getVerticalScrollValue?.() ?? 0;
      for (let i = 0; i < steps; i++) {
        const current = smartGrid.getVerticalScrollValue?.() ?? 0;
        smartGrid.setVerticalScrollValue(current + stepDistance);
        await new Promise((r) => setTimeout(r, stepDuration));
      }
      const end = smartGrid.getVerticalScrollValue?.() ?? 0;
      return { start, end };
    },
    { steps, stepDistance, stepDuration },
  );

  return {
    startPosition: positions.start,
    endPosition: positions.end,
    actualDelta: positions.end - positions.start,
    durationMs: Date.now() - startedAt,
  };
}

// Drive gp-grid's measured scroll. Below ~312k rows gp-grid scrolls natively, so
// the realistic wheel path is used unchanged. Above that threshold gp-grid caps
// its DOM scroll container at 10,000,000px and compresses the scroll space
// (ratio < 1): a mouse wheel then moves the DOM scrollTop by only a fraction of
// its delta, so a wheel-driven pass would travel far less logical distance than
// the natively-scrolling grids and fail the fidelity guard. In that regime the
// scroller is stepped programmatically to cover the same LOGICAL distance the
// wheel-driven grids travel, and the delta is reported in logical (content) px
// (DOM delta ÷ ratio), keeping the FPS comparison over an equal scroll workload.
async function performGpGridMeasuredScroll(
  page: Page,
  options: ScrollOptions,
): Promise<ScrollResult> {
  const ratio = await page.evaluate(
    () => window.gridApi.getScrollRatio?.() ?? 1,
  );
  if (ratio >= 1) {
    return performWheelScroll(page, options);
  }

  const { duration, distance } = options;
  const steps = Math.ceil(duration / 16); // ~60fps
  // A logical step of (distance / steps) maps to (× ratio) DOM pixels.
  const domStep = (distance / steps) * ratio;
  const stepDuration = duration / steps;
  const startedAt = Date.now();

  const positions = await page.evaluate(
    async ({ steps, domStep, stepDuration }) => {
      const container = document.querySelector('[data-testid="grid-container"]');
      if (!container) {
        return { start: 0, end: 0 };
      }
      // gp-grid's scroll body is the unclassed overflow:auto child of the
      // container. Pick the child with the largest vertical overflow so the
      // header's 1px sub-pixel overflow does not shadow the scroll body.
      const gpContainer = container.querySelector(".gp-grid-container");
      const scrollable = gpContainer
        ? Array.from(gpContainer.children)
            .filter((child) => child.scrollHeight > child.clientHeight)
            .sort(
              (a, b) =>
                b.scrollHeight -
                b.clientHeight -
                (a.scrollHeight - a.clientHeight),
            )[0]
        : null;
      if (!scrollable) {
        return { start: 0, end: 0 };
      }

      const start = scrollable.scrollTop;
      for (let i = 0; i < steps; i++) {
        scrollable.scrollTop += domStep;
        await new Promise((r) => setTimeout(r, stepDuration));
      }
      return { start, end: scrollable.scrollTop };
    },
    { steps, domStep, stepDuration },
  );

  return {
    startPosition: positions.start / ratio,
    endPosition: positions.end / ratio,
    actualDelta: (positions.end - positions.start) / ratio,
    durationMs: Date.now() - startedAt,
  };
}

// Perform the measured scroll for a grid: wheel input for the natively-scrolling
// grids, and a scroll-API/programmatic pass for grids whose custom or compressed
// scroll model makes raw wheel input non-comparable (Smart.Grid, gp-grid at
// large row counts). See performSmartGridScroll / performGpGridMeasuredScroll.
export async function performMeasuredScroll(
  page: Page,
  grid: string,
  options: ScrollOptions,
): Promise<ScrollResult> {
  if (grid === "smart-grid") {
    return performSmartGridScroll(page, options);
  }
  if (grid === "gp-grid") {
    return performGpGridMeasuredScroll(page, options);
  }
  return performWheelScroll(page, options);
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

// Perform scroll with wheel events (more realistic)
export async function performWheelScroll(
  page: Page,
  options: ScrollOptions
): Promise<ScrollResult> {
  const { duration, distance } = options;
  const steps = Math.ceil(duration / 16);
  const deltaY = distance / steps;
  const stepDuration = duration / steps;
  const startPosition = await getScrollPosition(page);
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

  const endPosition = await getScrollPosition(page);

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
