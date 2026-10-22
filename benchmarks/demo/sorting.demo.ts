// benchmarks/demo/sorting.demo.ts
// Click a header to sort 1.5M rows, click again to flip, shift-click a second
// column for a multi-column sort.

import { caption, click, describeDemo, finish, headerCell, hover, openDemo, pause, test } from "./helpers";

const SALARY = 6;
const STATUS = 5;

test("sorting", async ({ page }, testInfo) => {
  describeDemo(testInfo, {
    scope: "sorting",
    title: "Multi-column sort on 1.5M rows",
    summary: "Sorting runs off the main thread in a worker; the grid stays responsive while the order updates.",
    talkingPoints: [
      "one click: 1.5M rows sorted by salary",
      "second click flips the direction",
      "shift-click adds a second key instead of replacing the first",
    ],
    keywords: ["sorting", "sort model", "tie-breaker", "multi-column sort"],
  });
  const pageErrors = await openDemo(page, testInfo);

  await caption(page, "Click a header to sort");
  await click(page, headerCell(page, SALARY));
  await pause(1300);

  await caption(page, "Click again to flip");
  await click(page, headerCell(page, SALARY));
  await pause(1300);

  await caption(page, "Shift-click adds a second sort key");
  await hover(page, headerCell(page, STATUS));
  await page.keyboard.down("Shift");
  await page.mouse.down();
  await pause(90);
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await pause(1500);

  await finish(page, pageErrors);
});
