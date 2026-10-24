// benchmarks/demo/row-groups.demo.ts
// Toggle row grouping on, widen the label column, expand a group and a
// nested one, collapse the top one.

import {
  caption, centerOf, click, describeDemo, drag, finish, groupToggle, hover, openDemo, pause, pressControl, test,
} from "./helpers";

test("row-groups", async ({ page }, testInfo) => {
  describeDemo(testInfo, {
    scope: "row-groups",
    title: "Row grouping",
    summary: "Group rows by a column; groups expand and collapse in place, with no remount of the grid.",
    talkingPoints: [
      "grouping is a prop change, the grid does not remount",
      "expand and collapse are O(visible rows)",
      "the same API drives client-side and server-side groups",
    ],
    keywords: ["row grouping", "row groups", "group rows", "grouped rows", "aggregation"],
  });
  const pageErrors = await openDemo(page, testInfo);

  await caption(page, "Group rows by a column");
  await pause(500);
  await pressControl(page, "Group rows");
  await pause(1100);

  // The playground's ID column is narrow; widen it by hand so labels read.
  const resizer = page.locator('.gp-grid-header-cell[data-col-index="0"] .gp-grid-header-resize-handle');
  const grip = await centerOf(resizer);
  await drag(page, grip, { x: grip.x + 150, y: grip.y }, { ms: 700, holdMs: 150 });
  await pause(600);

  await caption(page, "Expand a group");
  await click(page, groupToggle(page, 1));
  await pause(1000);

  await caption(page, "…and a nested one");
  await click(page, groupToggle(page, 2));
  await pause(1300);

  await caption(page, "Collapse it again");
  await hover(page, groupToggle(page, 1), 500);
  await click(page, groupToggle(page, 1));
  await pause(900);

  await finish(page, pageErrors);
});
