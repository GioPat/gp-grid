// Capture primitives: a V8 sampling profile of the page's main thread via the
// CDP Profiler domain (→ .cpuprofile), a Chrome trace via the browser-level
// tracing API (→ DevTools-loadable .trace.json), and the User Timing measures
// the page emitted while a scenario ran (gp-grid:* spans, react:commit).

import { chromium, type Browser, type Page } from "@playwright/test";
import { CHROME_ARGS, SAMPLING_INTERVAL_US, TRACE_CATEGORIES, VIEWPORT } from "./config";

export const launchBrowser = (headed: boolean): Promise<Browser> =>
  chromium.launch({ channel: "chrome", headless: headed === false, args: CHROME_ARGS });

export const newPage = async (browser: Browser): Promise<Page> => {
  const context = await browser.newContext({ viewport: VIEWPORT });
  return context.newPage();
};

export interface UserTimingMeasure {
  name: string;
  startTime: number;
  duration: number;
  detail?: unknown;
}

// Structural subset of the CDP Profiler.Profile object we persist and parse.
export interface CpuProfile {
  nodes: CpuProfileNode[];
  startTime: number;
  endTime: number;
  samples?: number[];
  timeDeltas?: number[];
}

export interface CpuProfileNode {
  id: number;
  callFrame: {
    functionName: string;
    url: string;
    scriptId: string;
    lineNumber: number;
    columnNumber: number;
  };
  hitCount?: number;
  children?: number[];
  parent?: number;
}

const clearMeasures = (page: Page): Promise<void> =>
  page.evaluate(() => {
    performance.clearMeasures();
  });

export const harvestMeasures = (page: Page): Promise<UserTimingMeasure[]> =>
  page.evaluate(() => {
    const entries = performance
      .getEntriesByType("measure")
      .map((entry) => ({
        name: entry.name,
        startTime: entry.startTime,
        duration: entry.duration,
        detail: (entry as PerformanceMeasure).detail ?? undefined,
      }));
    performance.clearMeasures();
    return entries;
  });

export interface CpuProfileCapture {
  profile: CpuProfile;
  measures: UserTimingMeasure[];
}

/** Run `scenario` while sampling the page's main thread. */
export const captureCpuProfile = async (
  page: Page,
  scenario: () => Promise<void>,
): Promise<CpuProfileCapture> => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: SAMPLING_INTERVAL_US });
  await clearMeasures(page);
  await cdp.send("Profiler.start");
  let profile: CpuProfile;
  try {
    await scenario();
  } finally {
    // Always stop so a failing scenario doesn't leave the profiler running.
    const stopped = await cdp.send("Profiler.stop");
    profile = stopped.profile as CpuProfile;
  }
  const measures = await harvestMeasures(page);
  await cdp.detach();
  return { profile, measures };
};

export interface TraceCapture {
  trace: Buffer;
  measures: UserTimingMeasure[];
}

/** Run `scenario` while recording a DevTools-compatible Chrome trace. */
export const captureTrace = async (
  browser: Browser,
  page: Page,
  scenario: () => Promise<void>,
): Promise<TraceCapture> => {
  await clearMeasures(page);
  await browser.startTracing(page, { categories: TRACE_CATEGORIES, screenshots: false });
  let trace: Buffer;
  try {
    await scenario();
  } finally {
    trace = await browser.stopTracing();
  }
  const measures = await harvestMeasures(page);
  return { trace, measures };
};
