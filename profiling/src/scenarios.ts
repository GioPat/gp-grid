// Scenarios drive the playground through window.gridApi (see
// playgrounds/*/src/profiling/hooks.ts) and real wheel input. Each scenario has
// a `prepare` step that runs outside the capture window (navigation, warm-up)
// and a `run` step that is profiled. Sort/filter mirror
// benchmarks/tests/sort-filter.spec.ts; scroll mirrors scroll-performance.spec.ts.

import type { Page } from "@playwright/test";
import {
  performWheelScroll,
  scrollToTop,
} from "../../benchmarks/src/utils/scroll-helpers";
import { SCROLL, type FrameworkTarget, type ScenarioId } from "./config";

export interface ScenarioContext {
  target: FrameworkTarget;
  baseUrl: string;
  rows: number;
}

export interface Scenario {
  id: ScenarioId;
  /** Runs before capture starts. */
  prepare: (page: Page, ctx: ScenarioContext) => Promise<void>;
  /** The profiled part. */
  run: (page: Page, ctx: ScenarioContext) => Promise<void>;
}

const READY_TIMEOUT_MS = 120_000;

const pageUrl = (ctx: ScenarioContext, rows: number): string =>
  `${ctx.baseUrl}/?rows=${rows}&profiling=1`;

const waitForIdle = (page: Page): Promise<void> =>
  page.evaluate(() => window.gridApi.waitForIdle());

// Rows are in the DOM and window.gridApi is installed (which also installs the
// gp-grid:* spans on the current core).
const waitForReady = async (page: Page): Promise<void> => {
  await page.waitForSelector('[data-testid="grid-container"]', {
    state: "visible",
    timeout: READY_TIMEOUT_MS,
  });
  await page.waitForFunction(
    () => window.gridApi !== undefined && window.gridApi.isReady(),
    undefined,
    { timeout: READY_TIMEOUT_MS },
  );
  await waitForIdle(page);
};

const openGrid = async (page: Page, ctx: ScenarioContext, rows: number): Promise<void> => {
  await page.goto(pageUrl(ctx, rows), { waitUntil: "load", timeout: READY_TIMEOUT_MS });
  await waitForReady(page);
};

const settle = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => window.gridApi.isReady(), undefined, {
    timeout: READY_TIMEOUT_MS,
  });
  await waitForIdle(page);
};

const load: Scenario = {
  id: "load",
  // Start on a tiny same-origin document so the renderer process (and the
  // attached profiler) survives the profiled navigation.
  prepare: (page, ctx) => openGrid(page, ctx, 1),
  run: (page, ctx) => openGrid(page, ctx, ctx.rows),
};

const scroll: Scenario = {
  id: "scroll",
  prepare: async (page, ctx) => {
    await openGrid(page, ctx, ctx.rows);
    await performWheelScroll(page, {
      duration: SCROLL.warmupDurationMs,
      distance: SCROLL.warmupDistancePx,
    });
    await scrollToTop(page);
    await waitForIdle(page);
  },
  run: async (page) => {
    await performWheelScroll(page, {
      duration: SCROLL.measureDurationMs,
      distance: SCROLL.measureDistancePx,
    });
    await waitForIdle(page);
  },
};

const sort: Scenario = {
  id: "sort",
  prepare: (page, ctx) => openGrid(page, ctx, ctx.rows),
  run: async (page, ctx) => {
    const { sortField, multiSort } = ctx.target.data;
    await page.evaluate((field) => window.gridApi.sort(field, "asc"), sortField);
    await settle(page);
    await page.evaluate((field) => window.gridApi.sort(field, "desc"), sortField);
    await settle(page);
    await page.evaluate(() => window.gridApi.clearSort());
    await settle(page);
    await page.evaluate((rules) => window.gridApi.sortMany(rules), multiSort);
    await settle(page);
    await page.evaluate(() => window.gridApi.clearSort());
    await settle(page);
  },
};

const filter: Scenario = {
  id: "filter",
  prepare: (page, ctx) => openGrid(page, ctx, ctx.rows),
  run: async (page, ctx) => {
    const { textFilter, numberFilter, complexFilter } = ctx.target.data;
    const clear = async (): Promise<void> => {
      await page.evaluate(() => window.gridApi.clearFilters());
      await settle(page);
    };
    for (const step of [[textFilter], [numberFilter], complexFilter]) {
      for (const { field, model } of step) {
        await page.evaluate(
          ({ field, model }) => window.gridApi.filter(field, model),
          { field, model },
        );
        await settle(page);
      }
      await clear();
    }
  },
};

export const SCENARIOS: Record<ScenarioId, Scenario> = { load, scroll, sort, filter };
