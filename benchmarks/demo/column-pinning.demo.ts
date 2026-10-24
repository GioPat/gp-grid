// benchmarks/demo/column-pinning.demo.ts
// Widen a column so the grid scrolls sideways, pin Name to the start, scroll,
// pin it to the end instead.

import {
  caption, cell, centerOf, click, describeDemo, drag, finish, headerCell, hover, openDemo, pause, test, wheel,
} from "./helpers";

const BIO = 3;

test("column-pinning", async ({ page }, testInfo) => {
  describeDemo(testInfo, {
    scope: "column-pinning",
    title: "Pinned columns",
    summary: "Pin a column to either edge; it stays put while the rest scrolls, inside the same virtual column window.",
    talkingPoints: [
      "one click on the header pins to the start, a second to the end, a third unpins",
      "the pinned regions scroll vertically with the body and keep their row heights",
      "only the mounted column window is in the DOM, pinned or not",
    ],
    keywords: ["pinning", "pinned column", "pin", "column window", "pinned regions"],
  });
  const pageErrors = await openDemo(page, testInfo);
  const nameHeader = page.locator(".gp-grid-header-cell", { hasText: "Name" }).first();

  await caption(page, "Widen a column so the grid scrolls sideways");
  const grip = await centerOf(headerCell(page, BIO).locator(".gp-grid-header-resize-handle"));
  await drag(page, grip, { x: grip.x + 320, y: grip.y }, { ms: 700, holdMs: 150 });
  await pause(500);

  await caption(page, "Pin the Name column");
  await hover(page, nameHeader);
  await click(page, nameHeader.locator(".gp-grid-pin-button"));
  await pause(900);

  await caption(page, "It stays while the rest scrolls");
  await hover(page, cell(page, 4, 4));
  await wheel(page, { dx: 160, bursts: 8, intervalMs: 90 });
  await pause(700);
  await wheel(page, { dx: -160, bursts: 8, intervalMs: 90 });
  await pause(500);

  await caption(page, "Click again: pinned to the end");
  await hover(page, nameHeader);
  await click(page, nameHeader.locator(".gp-grid-pin-button"));
  await pause(1200);

  await finish(page, pageErrors);
});
