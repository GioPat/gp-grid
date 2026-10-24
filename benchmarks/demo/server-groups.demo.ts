// benchmarks/demo/server-groups.demo.ts
// Groups served by a mock API: expand a group and only its children load.

import {
  caption, centerOf, click, describeDemo, drag, finish, groupToggle, hover, openDemo, pause, pressControl, test, waitForRows,
} from "./helpers";

test("server-groups", async ({ page }, testInfo) => {
  describeDemo(testInfo, {
    scope: "server-groups",
    title: "Server-side grouping",
    summary: "Groups and aggregates come from your service, page by page; expanding a group loads only its children.",
    talkingPoints: [
      "the grid asks for a group's children when it is expanded, nothing before",
      "counts and aggregates are the server's, shown as they arrive",
      "a stale page is dropped, an error shows in place with a retry",
    ],
    keywords: ["server grouping", "server groups", "server-side grouping", "remote groups", "createServerGroupingSource"],
  });
  const pageErrors = await openDemo(page, testInfo);

  await caption(page, "Groups served by an API, 300 ms per request");
  await hover(page, groupToggle(page, 1).or(page.locator('[data-cell-row="1"]').first()), 300);
  await pressControl(page, "Server groups");
  await waitForRows(page);
  await pause(1300);

  // The playground's ID column is narrow; widen it by hand so labels read.
  const resizer = page.locator('.gp-grid-header-cell[data-col-index="0"] .gp-grid-header-resize-handle');
  const grip = await centerOf(resizer);
  await drag(page, grip, { x: grip.x + 150, y: grip.y }, { ms: 700, holdMs: 150 });
  await pause(500);

  await caption(page, "Expand a group: only its children load");
  await click(page, groupToggle(page, 1));
  await pause(1500);

  await caption(page, "…and a nested one");
  await click(page, groupToggle(page, 2));
  await pause(1500);

  await caption(page, "Collapse");
  await click(page, groupToggle(page, 1));
  await pause(900);

  await finish(page, pageErrors);
});
