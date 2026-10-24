// benchmarks/demo/auto-fit.demo.ts
// Fit every column to its content, fit one column from its header edge, fit the rows.

import {
  caption, centerOf, describeDemo, finish, headerCell, hover, moveTo, openDemo, pause, pressControl, test,
} from "./helpers";

const BIO = 3;

test("auto-fit", async ({ page }, testInfo) => {
  describeDemo(testInfo, {
    scope: "auto-fit",
    title: "Auto-fit columns and rows",
    summary: "One-shot fits measure the rendered cells: every column, one column from its header edge, or the rows.",
    talkingPoints: [
      "a fit measures the mounted cells once; nothing watches the DOM afterwards",
      "double-click a header edge to fit that column",
      "row fits respect the configured minimum and maximum",
    ],
    keywords: ["auto-fit", "fit columns", "fit rows", "autosize", "column fit"],
  });
  const pageErrors = await openDemo(page, testInfo);

  await caption(page, "Fit every column to its content");
  await hover(page, headerCell(page, 1));
  await pause(300);
  await pressControl(page, "Fit columns");
  await pause(1300);

  await caption(page, "Double-click a header edge to fit one column");
  const edge = headerCell(page, BIO).locator(".gp-grid-header-resize-handle");
  const point = await centerOf(edge);
  await moveTo(page, point, 600);
  await pause(300);
  await page.mouse.dblclick(point.x, point.y);
  await pause(1200);

  await caption(page, "Fit the rows to their content");
  await pressControl(page, "Fit rows");
  await pause(1200);

  await finish(page, pageErrors);
});
