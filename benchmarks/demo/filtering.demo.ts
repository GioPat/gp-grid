// benchmarks/demo/filtering.demo.ts
// Open a column's filter, pick the values to keep, apply, scroll the matches.

import { caption, cell, click, describeDemo, finish, headerCell, hover, openDemo, pause, test, wheel } from "./helpers";

const STATUS = 5;

test("filtering", async ({ page }, testInfo) => {
  describeDemo(testInfo, {
    scope: "filtering",
    title: "Column filters",
    summary: "Type-aware filters per column: pick values from a list or write conditions; the grid shows only the matches.",
    talkingPoints: [
      "a values list with search, plus text, number and date conditions",
      "conditions combine with and/or inside groups",
      "the same filter model goes to a server source unchanged",
    ],
    keywords: ["filtering", "filter", "filter popup", "filter model", "conditions"],
  });
  const pageErrors = await openDemo(page, testInfo);
  // The popup mounts outside the grid shell, which the stage hides.
  await page.addStyleTag({ content: "#root .gp-grid-filter-popup, #root .gp-grid-filter-popup * { visibility: visible; }" });

  await caption(page, "Open the Status filter");
  await hover(page, headerCell(page, STATUS));
  await pause(300);
  await click(page, headerCell(page, STATUS).locator(".gp-grid-filter-icon"));
  await pause(900);

  await caption(page, "Keep only the pending ones");
  const popup = page.locator(".gp-grid-filter-popup");
  await click(page, popup.locator(".gp-grid-filter-actions button").nth(1));
  await pause(500);
  await click(page, popup.locator(".gp-grid-filter-option", { hasText: "pending" }));
  await pause(600);
  await click(page, popup.locator(".gp-grid-filter-btn-apply"));
  await pause(1300);

  await caption(page, "Only the matches remain");
  await hover(page, cell(page, 2, STATUS));
  await wheel(page, { dy: 120, bursts: 8, intervalMs: 90 });
  await pause(800);

  await finish(page, pageErrors);
});
