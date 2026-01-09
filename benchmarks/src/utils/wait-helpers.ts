// Helpers to wait for grid ready state across different libraries

import type { Page } from "@playwright/test";
import type { GridType } from "../data/types";

const GRID_READY_TIMEOUT = 30_000;

export async function waitForGridReady(
  page: Page,
  grid: GridType
): Promise<number> {
  const start = Date.now();

  // First, wait for the grid container to be visible
  await page.waitForSelector('[data-testid="grid-container"]', {
    state: "visible",
    timeout: GRID_READY_TIMEOUT,
  });

  // Then wait for grid API to report ready
  await page.waitForFunction(
    () => {
      return window.gridApi && window.gridApi.isReady();
    },
    { timeout: GRID_READY_TIMEOUT }
  );

  // Library-specific additional waits
  switch (grid) {
    case "gp-grid":
      // Wait for row slots to be rendered
      await page.waitForSelector('.gp-grid-row', {
        state: "attached",
        timeout: GRID_READY_TIMEOUT,
      });
      break;

    case "ag-grid":
      // Wait for AG Grid rows
      await page.waitForSelector(".ag-row", {
        state: "attached",
        timeout: GRID_READY_TIMEOUT,
      });
      break;

    case "tanstack-table":
      // Wait for virtual rows
      await page.waitForSelector('[data-row-index]', {
        state: "attached",
        timeout: GRID_READY_TIMEOUT,
      });
      break;

    case "handsontable":
      // Wait for Handsontable cells
      await page.waitForSelector(".htCore td", {
        state: "attached",
        timeout: GRID_READY_TIMEOUT,
      });
      break;
  }

  return Date.now() - start;
}

export async function waitForSortComplete(
  page: Page,
  _grid: GridType
): Promise<void> {
  // Wait for any loading indicators to disappear
  await page.waitForFunction(
    () => {
      return window.gridApi && window.gridApi.isReady();
    },
    { timeout: GRID_READY_TIMEOUT }
  );

  // Small delay to ensure rendering is complete
  await page.waitForTimeout(50);
}

export async function waitForFilterComplete(
  page: Page,
  _grid: GridType
): Promise<void> {
  await page.waitForFunction(
    () => {
      return window.gridApi && window.gridApi.isReady();
    },
    { timeout: GRID_READY_TIMEOUT }
  );

  await page.waitForTimeout(50);
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
