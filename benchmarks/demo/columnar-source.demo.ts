// benchmarks/demo/columnar-source.demo.ts
// Bind 1.5M rows held as typed arrays: no row objects, each cell reads its
// column in place, the sorter walks the array.

import {
  caption, cell, click, describeDemo, finish, headerCell, hover, jumpToRow, openDemo, pause, pressControl, test, waitForRows, wheel,
} from "./helpers";

const SALARY = 6;
const TOTAL_ROWS = 1_500_000;

test("columnar-source", async ({ page }, testInfo) => {
  describeDemo(testInfo, {
    scope: "columnar-source",
    title: "Columnar data source",
    summary: "Bind typed arrays directly: 1.5M rows with no row objects, read in place, sorted by walking the column.",
    talkingPoints: [
      "one typed array per field, borrowed as-is; strings and dates through small code tables",
      "construction is O(columns): no row objects, no ID table on bind",
      "read-only by contract: every write is refused and reported through onWriteRejected",
      "bump the revision after you change your arrays and the grid re-reads them",
    ],
    keywords: ["columnar", "createColumnarDataSource", "typed array", "typed arrays", "columnar source", "revision"],
  });
  const pageErrors = await openDemo(page, testInfo);

  await caption(page, "Same 1.5M people, now as typed arrays");
  await hover(page, cell(page, 1, 1));
  await pause(300);
  await pressControl(page, "Columnar");
  await waitForRows(page);
  await pause(1600);

  await caption(page, "No row objects: each cell reads its column in place");
  await wheel(page, { dy: 140, bursts: 12, intervalMs: 80 });
  await pause(1000);

  await caption(page, "Jump to row 1,200,000");
  await jumpToRow(page, 1_200_000, TOTAL_ROWS);
  await pause(1500);

  await caption(page, "Sort by salary: the sorter walks the Float64Array");
  await click(page, headerCell(page, SALARY));
  await waitForRows(page);
  await pause(1600);
  await hover(page, cell(page, 2, SALARY), 700);
  await wheel(page, { dy: 120, bursts: 8, intervalMs: 90 });
  await pause(900);

  await finish(page, pageErrors, 1800);
});
