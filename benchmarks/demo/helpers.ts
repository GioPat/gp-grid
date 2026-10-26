// benchmarks/demo/helpers.ts
// Shared helpers for the gridcast demo recordings. They reuse the conformance
// selectors (`cell`, `headerCell`, ...) and add what a *video* needs that a
// test does not: human-paced mouse motion and captions, on the stage from
// stage.ts.
//
// A demo file is `demo/<scope>.demo.ts`, where <scope> is the conventional
// commit scope it illustrates (`feat(fill-handle): ...` -> `fill-handle.demo.ts`).
// gridcast matches changelog entries to demos by that name.

import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { cell, headerCell } from "../conformance/helpers";
import { installStage } from "./stage";

export { cell, headerCell };

export interface DemoMeta {
  /** Conventional-commit scope this demo illustrates. */
  scope: string;
  /** Short human title, used as the title card and as the default caption. */
  title: string;
  /** One or two sentences: what the viewer should notice. */
  summary: string;
  /** Prompt for the author's voice-over: 3-5 bullet points to improvise on. */
  talkingPoints?: string[];
  /**
   * Phrases that map changelog entries to this demo, besides the file's scope.
   * Every word of a phrase must appear in the entry ("fill handle" matches
   * "fix the fill handle on resize"). gridcast reads these statically.
   */
  keywords?: string[];
}

/** Register the demo's metadata so gridcast can read it from the report. */
export const describeDemo = (testInfo: TestInfo, meta: DemoMeta): void => {
  testInfo.annotations.push({ type: "gridcast", description: JSON.stringify(meta) });
};

const STAGE_PADDING = 28;

/** Open the playground on the demo stage (see stage.ts). */
export const openDemo = async (page: Page, testInfo?: TestInfo): Promise<Error[]> => {
  const startedAt = Date.now();
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await installStage(page, STAGE_PADDING);

  await page.goto("/");
  await expect(page.locator(".gp-grid-container")).toHaveCount(1);
  await expect(cell(page, 0, 1)).toContainText("Person");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.mouse.move(640, 360);
  // Tell gridcast how much page-load to cut from the head of the recording.
  testInfo?.annotations.push({ type: "gridcast-ready-ms", description: String(Date.now() - startedAt) });
  await pause(900);
  return pageErrors;
};

/**
 * Jump straight to a row. The body scroller is compressed for very large
 * datasets, so the target is a fraction of the real scroll range, not
 * `rowHeight * row`.
 */
export const jumpToRow = async (page: Page, row: number, totalRows: number): Promise<void> => {
  await scroller(page).evaluate((element, fraction) => {
    element.scrollTop = Math.round((element.scrollHeight - element.clientHeight) * fraction);
  }, row / totalRows);
  await waitForRows(page);
};

/** Wait until the body shows rows again (after a long jump). */
export const waitForRows = async (page: Page): Promise<void> => {
  await expect.poll(() => page.locator("[data-cell-row]").count(), { timeout: 10_000 }).toBeGreaterThan(0);
};

/**
 * Global pace multiplier for every pause and mouse motion. 1 = as written,
 * 1.5 = everything 50% slower. Set by gridcast from `demos.pace`, or by hand:
 * `GRIDCAST_PACE=1.5 npx playwright test --config playwright.demo.config.ts`.
 */
export const PACE = Math.max(0.2, Number(process.env.GRIDCAST_PACE ?? "1") || 1);

export const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms * PACE));

export const captionsEnabled = (): boolean => process.env.GRIDCAST_CAPTIONS !== "0";

/** Show a caption pill at the bottom of the stage (empty string hides it). */
export const caption = async (page: Page, text: string): Promise<void> => {
  if (captionsEnabled() === false) return;
  await page.evaluate((value) => {
    (window as unknown as { __demoCaption?: (text: string) => void }).__demoCaption?.(value);
  }, text);
};

export const centerOf = async (locator: Locator): Promise<{ x: number; y: number }> => {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("Element is not measurable.");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** Mouse motion with enough steps to read as a hand on the video. */
export const moveTo = async (page: Page, target: { x: number; y: number }, ms = 500): Promise<void> => {
  const steps = Math.max(8, Math.round((ms * PACE) / 16));
  await page.mouse.move(target.x, target.y, { steps });
};

export const hover = async (page: Page, locator: Locator, ms = 500): Promise<void> => {
  await moveTo(page, await centerOf(locator), ms);
};

export const click = async (page: Page, locator: Locator): Promise<void> => {
  await hover(page, locator);
  await pause(180);
  await page.mouse.down();
  await pause(90);
  await page.mouse.up();
};

/** Press, drag along a path and release, each leg at a human pace. */
export const drag = async (
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: { ms?: number; via?: { x: number; y: number }[]; holdMs?: number } = {},
): Promise<void> => {
  await moveTo(page, from);
  await pause(160);
  await page.mouse.down();
  await pause(120);
  // A first short leg so drag-threshold logic engages before the long move.
  await page.mouse.move(from.x + 6, from.y + 6, { steps: 4 });
  for (const point of options.via ?? []) await moveTo(page, point, options.ms ?? 600);
  await moveTo(page, to, options.ms ?? 700);
  await pause(options.holdMs ?? 260);
  await page.mouse.up();
};

/** Scroll the body with the wheel in bursts so the virtual scroll is visible. */
export const wheel = async (
  page: Page,
  options: { dy?: number; dx?: number; bursts?: number; intervalMs?: number },
): Promise<void> => {
  const { dy = 0, dx = 0, bursts = 10, intervalMs = 70 } = options;
  for (let index = 0; index < bursts; index += 1) {
    await page.mouse.wheel(dx, dy);
    await pause(intervalMs); // pause() already applies PACE
  }
};

/** Click a playground control (hidden by the stage CSS) by its label. */
export const pressControl = async (page: Page, name: string): Promise<void> => {
  await page.getByRole("button", { name, exact: true, includeHidden: true }).evaluate((element) => (element as HTMLButtonElement).click());
};

/** Grid body scroller, as the conformance helpers locate it. */
export const scroller = (page: Page): Locator =>
  page.locator(".gp-grid-rows-wrapper").locator("xpath=../..");

export const groupToggle = (page: Page, row: number): Locator =>
  page.locator(`[data-cell-row="${row}"] .gp-grid-group-toggle`).first();

export const fillHandle = (page: Page): Locator => page.locator(".gp-grid-fill-handle");

/** Standard demo ending: hold the final state so the cut is not abrupt. */
export const finish = async (page: Page, pageErrors: Error[], holdMs = 1400): Promise<void> => {
  await caption(page, "");
  await pause(holdMs);
  expect(pageErrors).toEqual([]);
};

export { test, expect };
