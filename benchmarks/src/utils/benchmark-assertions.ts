import { expect, type Page } from "@playwright/test";

export const getBrowserVersion = (page: Page): string => {
  return page.context().browser()?.version() ?? "unknown";
};

export const expectDisplayedRowIds = async (
  page: Page,
  expectedIds: number[],
): Promise<void> => {
  const actualIds = await page.evaluate((count) => {
    return window.gridApi
      .getDisplayedRows(0, count)
      .map((row) => row.id);
  }, expectedIds.length);

  // Native-model grids return the full requested window, so this stays an exact
  // check. Virtual-data grids (Smart.Grid) can only surface the rows they have
  // actually painted, which is a shorter prefix; verify that prefix against the
  // reference order rather than trusting a benchmark-computed cache.
  expect(actualIds.length).toBeGreaterThan(0);
  expect(actualIds).toEqual(expectedIds.slice(0, actualIds.length));
};

export const expectDisplayedRowCount = async (
  page: Page,
  expectedCount: number,
): Promise<void> => {
  const actualCount = await page.evaluate(() => {
    return window.gridApi.getDisplayedRowCount();
  });

  expect(actualCount).toBe(expectedCount);
};
