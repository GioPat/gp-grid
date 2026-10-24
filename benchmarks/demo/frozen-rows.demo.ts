// benchmarks/demo/frozen-rows.demo.ts
// Freeze the first three rows, scroll the rest under them, unfreeze.

import { caption, cell, describeDemo, finish, hover, openDemo, pause, pressControl, test, wheel } from "./helpers";

test("frozen-rows", async ({ page }, testInfo) => {
  describeDemo(testInfo, {
    scope: "frozen-rows",
    title: "Frozen rows",
    summary: "Freeze the first rows under the header; the rest scrolls beneath them, including a fast fling.",
    talkingPoints: [
      "freeze the first n displayed rows with one option",
      "they keep their heights, editors and selection",
      "the frozen block is part of the same virtual window, not a second grid",
    ],
    keywords: ["frozen rows", "freeze rows", "freezeRows", "frozen prefix"],
  });
  const pageErrors = await openDemo(page, testInfo);

  await caption(page, "Freeze the first three rows");
  await hover(page, cell(page, 1, 1));
  await pause(400);
  await pressControl(page, "3");
  await pause(1000);

  await caption(page, "They stay under the header while you scroll");
  await hover(page, cell(page, 6, 3));
  await wheel(page, { dy: 120, bursts: 14, intervalMs: 80 });
  await pause(600);
  await wheel(page, { dy: 900, bursts: 10, intervalMs: 40 });
  await pause(900);

  await caption(page, "Unfreeze");
  await pressControl(page, "0");
  await pause(900);

  await finish(page, pageErrors);
});
