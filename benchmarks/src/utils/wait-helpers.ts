// Helpers to wait for grid ready state across different libraries

import type { Page } from "@playwright/test";

const GRID_READY_TIMEOUT = 30_000;

export async function waitForGridReady(page: Page): Promise<number> {
  const start = Date.now();

  // Wait for the grid container to be visible
  await page.waitForSelector('[data-testid="grid-container"]', {
    state: "visible",
    timeout: GRID_READY_TIMEOUT,
  });

  // All wrappers expose isReady as a DOM-based check, so this is grid-agnostic
  await page.waitForFunction(
    () => {
      return window.gridApi && window.gridApi.isReady();
    },
    { timeout: GRID_READY_TIMEOUT }
  );

  return Date.now() - start;
}

export async function waitForSortComplete(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      return window.gridApi && window.gridApi.isReady();
    },
    { timeout: GRID_READY_TIMEOUT }
  );

  // Small delay to ensure rendering is complete
  await page.waitForTimeout(50);
}

interface RowCountExpectation {
  equals?: number;
  greaterThan?: number;
  lessThan?: number;
}

export async function waitForFilterComplete(
  page: Page,
  expectation: RowCountExpectation,
): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      if (!window.gridApi?.isReady()) return false;

      const count = window.gridApi.getDisplayedRowCount();
      if (expected.equals !== undefined && count !== expected.equals) {
        return false;
      }
      if (expected.greaterThan !== undefined && count <= expected.greaterThan) {
        return false;
      }
      if (expected.lessThan !== undefined && count >= expected.lessThan) {
        return false;
      }
      return true;
    },
    expectation,
    { timeout: GRID_READY_TIMEOUT },
  );

  // Wait through a paint after the row model reports the expected result.
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

export async function waitForDataLoad(
  page: Page,
  expectedRowCount: number
): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      return (
        window.gridApi &&
        window.gridApi.isReady() &&
        window.gridApi.getRowCount() === expected
      );
    },
    expectedRowCount,
    { timeout: GRID_READY_TIMEOUT }
  );
}
