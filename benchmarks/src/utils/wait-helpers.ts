// Helpers to wait for grid ready state across different libraries

import type { Page } from "@playwright/test";

const GRID_READY_TIMEOUT = 30_000;

export async function waitForGridReady(
  page: Page,
  expectedRowCount?: number,
): Promise<void> {
  // Wait for the grid container to be visible
  await page.waitForSelector('[data-testid="grid-container"]', {
    state: "visible",
    timeout: GRID_READY_TIMEOUT,
  });

  // All wrappers expose isReady as a DOM-based check, so this is grid-agnostic
  await page.waitForFunction(
    (expected) => {
      if (window.gridApi === undefined) {
        return false;
      }

      const expectedRowsLoaded =
        expected === undefined || window.gridApi.getRowCount() === expected;
      const visibleRowsReady = expected === 0 || window.gridApi.isReady();

      return expectedRowsLoaded && visibleRowsReady;
    },
    expectedRowCount,
    { timeout: GRID_READY_TIMEOUT }
  );

  await page.evaluate(() => window.gridApi.waitForIdle());
}

export async function waitForSortComplete(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      return window.gridApi && window.gridApi.isReady();
    },
    { timeout: GRID_READY_TIMEOUT }
  );

  await page.evaluate(() => window.gridApi.waitForIdle());
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

  await page.evaluate(() => window.gridApi.waitForIdle());
}

export async function waitForDataLoad(
  page: Page,
  expectedRowCount: number
): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      if (window.gridApi === undefined) {
        return false;
      }

      const expectedRowsLoaded = window.gridApi.getRowCount() === expected;
      const visibleRowsReady = expected === 0 || window.gridApi.isReady();
      return expectedRowsLoaded && visibleRowsReady;
    },
    expectedRowCount,
    { timeout: GRID_READY_TIMEOUT }
  );

  await page.evaluate(() => window.gridApi.waitForIdle());
}
