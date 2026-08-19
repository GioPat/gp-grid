// Static configuration for the profiling harness: framework targets (which
// playground to build/serve and how), the data-specific fields the sort/filter
// scenarios use, and capture constants.

import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ColumnFilterModel } from "../../packages/core/src/types/filters";
import type { SortRule } from "../../playgrounds/vite-react/src/profiling/hooks";

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const RESULTS_ROOT = path.join(REPO_ROOT, "profiling", "results");

export type FrameworkId = "react";
export const FRAMEWORK_IDS: FrameworkId[] = ["react"];

export type ScenarioId = "load" | "scroll" | "sort" | "filter";
export const SCENARIO_IDS: ScenarioId[] = ["load", "scroll", "sort", "filter"];

export type CaptureMode = "cpuprofile" | "trace";

export interface FilterStep {
  field: string;
  model: ColumnFilterModel;
}

/** Fields the sort/filter scenarios use; depends on the playground's dataset. */
export interface ScenarioData {
  sortField: string;
  multiSort: SortRule[];
  textFilter: FilterStep;
  numberFilter: FilterStep;
  complexFilter: FilterStep[];
}

export interface FrameworkTarget {
  id: FrameworkId;
  label: string;
  /** Playground package directory (absolute). */
  playgroundDir: string;
  /** Preview server port used when the harness serves the build itself. */
  port: number;
  /** `pnpm exec` arguments producing the profiling build, run in playgroundDir. */
  buildArgs: string[];
  /** `pnpm exec` arguments serving the build on `port`, run in playgroundDir. */
  serveArgs: (port: number) => string[];
  /** Built assets root; URL paths of profiled scripts resolve under it. */
  distDir: string;
  data: ScenarioData;
}

const reactPlayground = path.join(REPO_ROOT, "playgrounds", "vite-react");

export const FRAMEWORKS: Record<FrameworkId, FrameworkTarget> = {
  react: {
    id: "react",
    label: "React",
    playgroundDir: reactPlayground,
    port: 5200,
    buildArgs: ["vite", "build", "--mode", "profiling"],
    serveArgs: (port) => [
      "vite",
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    distDir: path.join(reactPlayground, "dist"),
    data: {
      sortField: "salary",
      multiSort: [
        { field: "status", direction: "asc" },
        { field: "salary", direction: "desc" },
      ],
      textFilter: {
        field: "name",
        model: {
          conditions: [{ type: "text", operator: "contains", value: "Mario" }],
          combination: "and",
        },
      },
      numberFilter: {
        field: "salary",
        model: {
          conditions: [{ type: "number", operator: ">", value: 100000.5 }],
          combination: "and",
        },
      },
      complexFilter: [
        {
          field: "salary",
          model: {
            conditions: [
              {
                type: "number",
                operator: "between",
                value: 49999.5,
                valueTo: 150000.5,
              },
            ],
            combination: "and",
          },
        },
        {
          field: "status",
          model: {
            conditions: [{ type: "text", operator: "equals", value: "active" }],
            combination: "and",
          },
        },
      ],
    },
  },
};

// Same wheel input as benchmarks/tests/scroll-performance.spec.ts so a profile
// corresponds to the numbers the benchmark reports.
export const SCROLL = {
  warmupDurationMs: 1000,
  warmupDistancePx: 5000,
  measureDurationMs: 5000,
  measureDistancePx: 50000,
} as const;

export const DEFAULT_ROWS = 1_000_000;
export const VIEWPORT = { width: 1280, height: 720 } as const;
/** V8 sampling interval in microseconds. */
export const SAMPLING_INTERVAL_US = 100;

// Chrome launch flags mirrored from benchmarks/playwright.config.ts.
export const CHROME_ARGS = [
  "--enable-precise-memory-info",
  "--js-flags=--expose-gc",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
];

// DevTools-Performance-panel-compatible trace: timeline + frames + V8 sampling
// + User Timing (our gp-grid:* / react:commit spans and React's ⚛ tracks).
export const TRACE_CATEGORIES = [
  "-*",
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "disabled-by-default-devtools.timeline.stack",
  "v8.execute",
  "disabled-by-default-v8.cpu_profiler",
  "disabled-by-default-v8.cpu_profiler.hires",
  "blink.user_timing",
  "blink.console",
  "latencyInfo",
  "loading",
];
