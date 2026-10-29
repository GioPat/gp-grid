import { expect, test } from "@playwright/test";
import { filterCount, openFixture } from "./helpers";

const STATUS_COL_INDEX = 5;

test("custom filter renderer replaces the popup content", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  const filterIcon = page.locator(`.gp-grid-header-cell[data-col-index="${STATUS_COL_INDEX}"] .gp-grid-filter-icon`);
  const popup = page.locator(".gp-grid-filter-popup");

  await filterIcon.click();
  await expect(popup.locator(".gp-grid-filter-header")).toContainText("Status");
  await expect(popup.getByTestId("custom-filter-input")).toBeVisible();
  await expect(popup.locator(".gp-grid-filter-mode-toggle")).toHaveCount(0);
  await page.getByTestId("custom-filter-cancel").click();
  await expect(popup).toHaveCount(0);
  expect(await filterCount(page)).toBe(0);

  await filterIcon.click();
  await page.getByTestId("custom-filter-input").fill("inactive");
  await page.getByTestId("custom-filter-apply").click();
  await expect(popup).toHaveCount(0);
  await expect.poll(() => filterCount(page)).toBe(1);
  await expect(page.locator('[data-cell-row="0"][data-cell-col="1"]')).toContainText("Row 001");

  await filterIcon.click();
  // The popup arms its Escape listener one frame after opening.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
