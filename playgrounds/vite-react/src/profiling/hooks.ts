// Profiling hooks for the playground (playground-only, nothing ships in
// @gp-grid/*). Two responsibilities:
//   1. URL params: `?rows=N` (dataset size) and `?profiling=1` (enable spans
//      + expose window.gridApi). Both default to the normal demo behaviour.
//   2. `window.gridApi`: the small control surface the profiling harness in
//      /profiling drives (readiness, idle, sort/filter, scroll ratio).
//
// Framework-agnostic on purpose: the same file can be copied to the Vue and
// Angular playgrounds; only the `getCore` accessor differs per framework.

import type {
  ColumnFilterModel,
  GridCore,
  SortDirection,
} from "@gp-grid/react";
import { installCoreSpans } from "./span-wrappers";

export const DEFAULT_ROW_COUNT = 1_500_000;

export interface ProfilingParams {
  /** Rows to generate (`?rows=N`). */
  rows: number;
  /** Whether spans and window.gridApi are installed (`?profiling=1`). */
  enabled: boolean;
}

export const readProfilingParams = (): ProfilingParams => {
  if (typeof window === "undefined") {
    return { rows: DEFAULT_ROW_COUNT, enabled: false };
  }
  const params = new URLSearchParams(window.location.search);
  const rows = Number.parseInt(params.get("rows") ?? "", 10);
  return {
    rows: Number.isFinite(rows) && rows > 0 ? rows : DEFAULT_ROW_COUNT,
    enabled: params.get("profiling") === "1",
  };
};

export interface SortRule {
  field: string;
  direction: SortDirection;
}

/** Control surface exposed on window for the profiling harness. */
export interface ProfilingGridApi {
  /** Rows are rendered in the DOM. */
  isReady(): boolean;
  /** Resolves after two animation frames (paint settled). */
  waitForIdle(): Promise<void>;
  /** Rows the page was asked to generate. */
  getRowCount(): number;
  /** Rows currently in the grid (after filtering). */
  getDisplayedRowCount(): number;
  /** DOM-to-logical scroll compression ratio (1 = none). */
  getScrollRatio(): number;
  sort(field: string, direction: SortDirection): Promise<void>;
  sortMany(rules: SortRule[]): Promise<void>;
  clearSort(): Promise<void>;
  filter(field: string, model: ColumnFilterModel): Promise<void>;
  clearFilters(): Promise<void>;
}

declare global {
  interface Window {
    gridApi: ProfilingGridApi;
  }
}

const waitForIdle = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

const isReady = (): boolean =>
  document.querySelectorAll(".gp-grid-row").length > 0;

type GetCore = () => GridCore<unknown> | null;

// The core may be (re)created after attach; installing is idempotent, so we
// re-check whenever the harness polls readiness.
const ensureSpans = (getCore: GetCore): void => {
  const core = getCore();
  if (core !== null) installCoreSpans(core);
};

const buildGridApi = (rows: number, getCore: GetCore): ProfilingGridApi => {
  const withCore = async (
    action: (core: GridCore<unknown>) => Promise<void>,
  ): Promise<void> => {
    const core = getCore();
    if (core === null) throw new Error("profiling: grid core not available");
    await action(core);
  };

  return {
    isReady: () => {
      ensureSpans(getCore);
      return isReady();
    },
    waitForIdle,
    getRowCount: () => rows,
    getDisplayedRowCount: () => getCore()?.getRowCount() ?? 0,
    getScrollRatio: () => getCore()?.getScrollRatio() ?? 1,
    sort: (field, direction) =>
      withCore((core) => core.setSort(field, direction)),
    sortMany: (rules) =>
      withCore(async (core) => {
        const [first, ...rest] = rules;
        if (first === undefined) return;
        await core.setSort(first.field, first.direction);
        for (const rule of rest) {
          await core.setSort(rule.field, rule.direction, true);
        }
      }),
    clearSort: () => withCore((core) => core.setSort("", null)),
    filter: (field, model) => withCore((core) => core.setFilter(field, model)),
    clearFilters: () =>
      withCore(async (core) => {
        for (const field of Object.keys(core.getFilterModel())) {
          await core.setFilter(field, null);
        }
      }),
  };
};

/**
 * Wire profiling for a mounted grid: installs the `gp-grid:*` spans on the
 * current core (idempotent, safe to call again after the core is recreated)
 * and exposes window.gridApi. No-op unless `?profiling=1`.
 */
export const attachProfiling = (
  params: ProfilingParams,
  getCore: GetCore,
): void => {
  if (params.enabled === false || typeof window === "undefined") return;
  ensureSpans(getCore);
  window.gridApi = buildGridApi(params.rows, getCore);
};
