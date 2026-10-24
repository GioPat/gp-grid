// benchmarks/demo/pivot.demo.ts
// Pivot the people by creation month: one generated column per month and
// measure, row totals on the right, groups by status.

import {
  caption, cell, centerOf, click, describeDemo, drag, finish, groupToggle, hover, openDemo, pause, pressControl, test, waitForRows, wheel,
} from "./helpers";

test("pivot", async ({ page }, testInfo) => {
  describeDemo(testInfo, {
    scope: "pivot",
    title: "Read-only pivot",
    summary: "Fold 1.5M rows into a pivot in the browser: one column per key and measure, nested headers, totals.",
    talkingPoints: [
      "rows by status then name, columns by month, salaries summed and ages averaged",
      "the schema is generated for you; column ids are stable across refreshes",
      "a precomputed pivot from your server renders through the same contract, without the engine",
    ],
    keywords: ["pivot", "createPivotSource", "buildPivotSchema", "generated columns", "pivot schema"],
  });
  const pageErrors = await openDemo(page, testInfo);

  await caption(page, "Pivot 1.5M rows by creation month");
  await hover(page, cell(page, 1, 1));
  await pause(300);
  await pressControl(page, "Pivot");
  await waitForRows(page);
  await pause(2200);

  // The label column is narrow; widen it by hand so labels read.
  const resizer = page.locator('.gp-grid-header-cell[data-col-index="0"] .gp-grid-header-resize-handle');
  const grip = await centerOf(resizer);
  await drag(page, grip, { x: grip.x + 120, y: grip.y }, { ms: 600, holdMs: 150 });
  await pause(900);

  await caption(page, "One band per month, a column per measure");
  const bands = page.locator(".gp-grid-header-group");
  await hover(page, bands.nth(0), 700);
  await pause(500);
  await hover(page, bands.nth(1), 900);
  await pause(500);
  await hover(page, bands.nth(2), 900);
  await pause(1100);

  await caption(page, "Expand a status: one row per person");
  await click(page, groupToggle(page, 1));
  await pause(2000);
  await hover(page, cell(page, 3, 1), 800);
  await pause(400);
  await hover(page, cell(page, 3, 4), 1200);
  await pause(1200);

  await caption(page, "Months across, totals on the right");
  await wheel(page, { dx: 240, bursts: 16, intervalMs: 110 });
  await pause(1800);
  await hover(page, page.locator('[data-cell-row="1"][data-cell-col]').last(), 600);
  await pause(1000);

  await finish(page, pageErrors, 2000);
});
