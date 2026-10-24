// benchmarks/demo/row-heights.demo.ts
// Rows with their own height, a row edge dragged by hand, then a reset.

import {
  caption, cell, centerOf, describeDemo, drag, finish, hover, openDemo, pause, pressControl, test,
} from "./helpers";

test("row-heights", async ({ page }, testInfo) => {
  describeDemo(testInfo, {
    scope: "row-heights",
    title: "Per-row heights and row resize",
    summary: "Rows can have their own height, set from the API or dragged by hand; the scroll position stays anchored.",
    talkingPoints: [
      "heights are kept by row id, so they survive sorting and filtering",
      "drag a row edge to resize it, Alt+Arrow does the same from the keyboard",
      "the row under the cursor stays where it is while the rows above change size",
    ],
    keywords: ["row heights", "row height", "row resize", "variable row heights"],
  });
  const pageErrors = await openDemo(page, testInfo);

  await caption(page, "Rows can have their own height");
  await hover(page, cell(page, 1, 1));
  await pause(300);
  await pressControl(page, "Tall rows");
  await pause(1100);

  await caption(page, "Drag a row edge");
  await hover(page, cell(page, 4, 1), 500);
  const grip = await centerOf(page.locator('[data-cell-row="4"] .gp-grid-row-resize-handle').first());
  await drag(page, grip, { x: grip.x, y: grip.y + 46 }, { ms: 700, holdMs: 220 });
  await pause(1000);

  await caption(page, "Reset");
  await pressControl(page, "Reset heights");
  await pause(900);

  await finish(page, pageErrors);
});
