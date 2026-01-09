// Scroll simulation helpers for benchmarking

import type { Page } from "@playwright/test";

export interface ScrollOptions {
  duration: number; // Total duration in ms
  distance: number; // Total distance to scroll in pixels
}

// Perform smooth continuous scroll
export async function performScroll(
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

      // Find the scrollable element (varies by library)
      const scrollable =
        container.querySelector(".gp-grid-container") || // gp-grid
        container.querySelector(".ag-body-viewport") ||  // AG Grid
        container.querySelector(".wtHolder") ||          // Handsontable
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

    const scrollable =
      container.querySelector(".gp-grid-container") ||
      container.querySelector(".ag-body-viewport") ||
      container.querySelector(".wtHolder") ||
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

    const scrollable =
      container.querySelector(".gp-grid-container") ||
      container.querySelector(".ag-body-viewport") ||
      container.querySelector(".wtHolder") ||
      container;

    scrollable.scrollTop = scrollable.scrollHeight;
  });
}

// Perform scroll with wheel events (more realistic)
export async function performWheelScroll(
  page: Page,
  options: ScrollOptions
): Promise<void> {
  const { duration, distance } = options;
  const steps = Math.ceil(duration / 16);
  const deltaY = distance / steps;
  const stepDuration = duration / steps;

  const container = await page.$('[data-testid="grid-container"]');
  if (!container) return;

  const box = await container.boundingBox();
  if (!box) return;

  // Position mouse over the grid
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  await page.mouse.move(centerX, centerY);

  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, deltaY);
    await page.waitForTimeout(stepDuration);
  }
}

// Get current scroll position
export async function getScrollPosition(page: Page): Promise<number> {
  return page.evaluate(() => {
    const container = document.querySelector('[data-testid="grid-container"]');
    if (!container) return 0;

    const scrollable =
      container.querySelector(".gp-grid-container") ||
      container.querySelector(".ag-body-viewport") ||
      container.querySelector(".wtHolder") ||
      container;

    return scrollable.scrollTop;
  });
}

// Get scroll height
export async function getScrollHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    const container = document.querySelector('[data-testid="grid-container"]');
    if (!container) return 0;

    const scrollable =
      container.querySelector(".gp-grid-container") ||
      container.querySelector(".ag-body-viewport") ||
      container.querySelector(".wtHolder") ||
      container;

    return scrollable.scrollHeight;
  });
}
