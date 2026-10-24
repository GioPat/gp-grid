// benchmarks/demo/virtual-scrolling.demo.ts
// 1.5M rows: a slow wheel, a fast fling, then a jump into the middle.

import { caption, cell, describeDemo, finish, hover, jumpToRow, openDemo, pause, test, wheel } from "./helpers";

test("virtual-scrolling", async ({ page }, testInfo) => {
  describeDemo(testInfo, {
    scope: "virtual-scrolling",
    title: "Virtual scrolling over 1.5M rows",
    summary: "Slot-based DOM recycling keeps the frame rate flat whether you scroll a few rows or jump a million.",
    talkingPoints: [
      "1.5 million rows in memory, a few dozen DOM nodes",
      "slow scroll, fast fling, jump to the middle: same cost",
      "no dropped frames in the open benchmarks",
    ],
    keywords: ["virtual scrolling", "scrolling", "fling", "scroll position"],
  });
  const pageErrors = await openDemo(page, testInfo);

  await caption(page, "1.5M rows, a handful of DOM nodes");
  await hover(page, cell(page, 3, 3));
  await pause(300);
  await wheel(page, { dy: 120, bursts: 12, intervalMs: 90 });
  await pause(500);

  await caption(page, "Fling");
  await wheel(page, { dy: 900, bursts: 18, intervalMs: 40 });
  await pause(700);

  await caption(page, "Jump to row 1,000,000");
  await jumpToRow(page, 1_000_000, 1_500_000);
  await pause(1100);
  await wheel(page, { dy: 120, bursts: 10, intervalMs: 90 });

  await finish(page, pageErrors);
});
