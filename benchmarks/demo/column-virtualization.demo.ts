// benchmarks/demo/column-virtualization.demo.ts
// 208 columns over 1.5M rows: only the column window around the viewport is
// in the DOM, and it follows the horizontal scroll.

import {
  caption, cell, click, describeDemo, finish, headerCell, hover, openDemo, pause, pressControl, scroller, test, waitForRows, wheel,
} from "./helpers";

const NAME = 1;
const TOTAL_COLUMNS = 208;

test("column-virtualization", async ({ page }, testInfo) => {
  describeDemo(testInfo, {
    scope: "column-virtualization",
    title: "Column virtualization",
    summary: "A mounted column window follows the horizontal scroll: 208 columns over 1.5M rows, a dozen or so in the DOM.",
    talkingPoints: [
      "center columns mount only inside the viewport plus columnOverscan px on each side",
      "pinned columns stay mounted at either edge, outside the window",
      "the window is published to the wrappers, so React, Vue and Angular render the same slots",
      "SSR seeds the window from a 1920 px viewport",
    ],
    keywords: ["column window", "mounted column window", "columnOverscan", "column virtualization", "virtual columns", "wide grid"],
  });
  const pageErrors = await openDemo(page, testInfo);

  await caption(page, "Add 200 metric columns: 208 in total");
  await hover(page, cell(page, 1, 1));
  await pause(300);
  await pressControl(page, "Wide");
  await waitForRows(page);
  await pause(1500);

  const mounted = await page.locator(".gp-grid-header-cell[data-col-index]").count();
  await caption(page, `${mounted} of ${TOTAL_COLUMNS} columns in the DOM`);
  await pause(1800);

  await caption(page, "Scroll sideways: the window moves, the DOM stays small");
  await hover(page, cell(page, 3, 4));
  await wheel(page, { dx: 180, bursts: 18, intervalMs: 90 });
  await pause(1300);

  await caption(page, "Jump to the far end");
  await scroller(page).evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await pause(1200);
  await hover(page, page.locator('[data-cell-row="2"][data-cell-col]').last(), 700);
  await pause(900);

  await caption(page, "Pin Name: it stays while the window moves");
  await scroller(page).evaluate((element) => {
    element.scrollLeft = 0;
  });
  await pause(1000);
  await hover(page, headerCell(page, NAME));
  await click(page, headerCell(page, NAME).locator(".gp-grid-pin-button"));
  await pause(900);
  await hover(page, cell(page, 3, 4));
  await wheel(page, { dx: 180, bursts: 14, intervalMs: 90 });
  await pause(1300);

  await finish(page, pageErrors, 1800);
});
