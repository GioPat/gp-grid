// benchmarks/demo/history.demo.ts
// Edit a cell, take it back with Ctrl+Z, bring it back with Ctrl+Y.

import { caption, cell, centerOf, click, describeDemo, finish, moveTo, openDemo, pause, test } from "./helpers";

const NAME = 1;

test("history", async ({ page }, testInfo) => {
  describeDemo(testInfo, {
    scope: "history",
    title: "Undo and redo",
    summary: "Every edit, paste or fill is one write command; with history on, Ctrl+Z takes it back by record id, even after a sort.",
    talkingPoints: [
      "one command is one undo step: a 200-cell fill undoes at once",
      "undo writes back by record id, so the row can have moved or scrolled away",
      "a cell your app changed in the meantime refuses the undo instead of overwriting it",
    ],
    keywords: ["undo", "redo", "history", "write command", "onWriteCommitted", "maxEntries"],
  });
  const pageErrors = await openDemo(page, testInfo);

  await caption(page, "Edit a cell");
  const point = await centerOf(cell(page, 1, NAME));
  await moveTo(page, point, 600);
  await pause(200);
  await page.mouse.dblclick(point.x, point.y);
  await pause(500);
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Ada Lovelace", { delay: 70 });
  await pause(400);
  await page.keyboard.press("Enter");
  await pause(1000);

  await caption(page, "Ctrl+Z takes it back");
  await click(page, cell(page, 1, NAME));
  await pause(300);
  await page.keyboard.press("Control+z");
  await pause(1200);

  await caption(page, "Ctrl+Y brings it back");
  await page.keyboard.press("Control+y");
  await pause(1300);

  await finish(page, pageErrors);
});
