// benchmarks/demo/fill-handle.demo.ts
// Select a cell, grab the fill handle, drag it down a few rows.

import {
  caption, cell, centerOf, click, describeDemo, drag, fillHandle, finish, hover, openDemo, pause, test,
} from "./helpers";

const NAME = 1;

test("fill-handle", async ({ page }, testInfo) => {
  describeDemo(testInfo, {
    scope: "fill-handle",
    title: "Excel-like fill handle",
    summary: "Grab the corner of a selection and drag to fill the cells below, like a spreadsheet.",
    talkingPoints: [
      "select a cell, the handle appears at its corner",
      "drag down: the value fills the range",
      "works on any editable column, with custom renderers too",
    ],
    keywords: ["fill handle", "fill drag", "range selection"],
  });
  const pageErrors = await openDemo(page, testInfo);

  await caption(page, "Select a cell");
  await click(page, cell(page, 1, NAME));
  await pause(700);

  await caption(page, "Drag the fill handle");
  await hover(page, fillHandle(page), 400);
  await pause(300);
  const from = await centerOf(fillHandle(page));
  const to = await centerOf(cell(page, 8, NAME));
  await drag(page, from, { x: from.x, y: to.y }, { ms: 1100, holdMs: 400 });
  await pause(1200);

  await finish(page, pageErrors);
});
