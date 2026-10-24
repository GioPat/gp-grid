// benchmarks/demo/column-groups.demo.ts
// Nested header groups with their own band heights, following the columns on scroll.

import { caption, cell, describeDemo, finish, hover, openDemo, pause, pressControl, test, wheel } from "./helpers";

test("column-groups", async ({ page }, testInfo) => {
  describeDemo(testInfo, {
    scope: "column-groups",
    title: "Nested column groups",
    summary: "Group columns under header bands of any depth; the bands split and merge as columns move, pin or scroll.",
    talkingPoints: [
      "groups nest to any depth, with uneven branches",
      "each band can have its own height",
      "a group header is one fragment per contiguous run of its columns",
    ],
    keywords: ["column groups", "header groups", "nested headers", "header bands", "grouped headers"],
  });
  const pageErrors = await openDemo(page, testInfo);

  await caption(page, "Nested header groups");
  await hover(page, cell(page, 1, 2));
  await pause(300);
  await pressControl(page, "Grouped headers");
  await pause(1300);

  await caption(page, "Bands can have their own height");
  await pressControl(page, "Tall band");
  await pause(1100);

  await caption(page, "They follow the columns when you scroll");
  await hover(page, cell(page, 3, 3));
  await wheel(page, { dx: 140, bursts: 8, intervalMs: 90 });
  await pause(600);
  await wheel(page, { dx: -140, bursts: 8, intervalMs: 90 });
  await pause(600);

  await finish(page, pageErrors);
});
