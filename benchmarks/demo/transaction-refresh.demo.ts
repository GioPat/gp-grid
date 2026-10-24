// benchmarks/demo/transaction-refresh.demo.ts
// The application updates a record on its source three times; only that row
// redraws, no re-query of the 1.5M rows.

import { caption, cell, describeDemo, finish, hover, openDemo, pause, pressControl, test } from "./helpers";

const NAME = 1;

test("transaction-refresh", async ({ page }, testInfo) => {
  describeDemo(testInfo, {
    scope: "transaction-refresh",
    title: "Live updates without a re-query",
    summary: "An update on the mutable source redraws the rows that changed; 1.5M rows stay where they are, no query, no re-sort.",
    talkingPoints: [
      "the source reports which rows a batch changed",
      "an update costs the window, not the dataset: a fraction of a millisecond at a million rows",
      "adds and removes keep the full refresh; the row keeps its place under a sort until the next query",
    ],
    keywords: ["transaction", "refreshFromTransaction", "updateRow", "live update", "change details", "mutable source"],
  });
  const pageErrors = await openDemo(page, testInfo);

  await caption(page, "The app updates a record on its source");
  await hover(page, cell(page, 0, NAME), 500);
  await pause(300);
  await pressControl(page, "Update Row 1");
  await pause(1100);

  await caption(page, "No re-query: only that row redraws");
  await pressControl(page, "Update Row 1");
  await pause(1000);
  await pressControl(page, "Update Row 1");
  await pause(1000);

  await caption(page, "1.5M rows, one row of work");
  await pressControl(page, "Update Row 1");
  await pause(1200);

  await finish(page, pageErrors);
});
