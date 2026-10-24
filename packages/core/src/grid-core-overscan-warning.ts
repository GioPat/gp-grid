// packages/core/src/grid-core-overscan-warning.ts
// One-time advisory for ViewSync: scroll virtualization kicked in while the
// row overscan is too small for momentum flings at that scale.

import type { ScrollVirtualizationManager } from "./managers";

// With scroll virtualization active a fast fling traverses several rows per
// frame; overscan below this leaves blank rows behind the fling.
const RECOMMENDED_SCALED_OVERSCAN = 10;

export interface OverscanWarningDeps {
  scrollVirtualization: ScrollVirtualizationManager;
  overscan: number;
  getTotalRows: () => number;
}

/**
 * One-time advisory when scroll virtualization kicks in with a small
 * overscan: momentum flings move several rows per frame at that scale,
 * and a small overscan shows blank rows behind the fling.
 */
export const createOverscanWarning = (deps: OverscanWarningDeps): (() => void) => {
  let hasWarnedAboutScaledOverscan = false;
  return () => {
    if (hasWarnedAboutScaledOverscan) return;
    if (deps.scrollVirtualization.isScalingActive() === false) return;
    hasWarnedAboutScaledOverscan = true;
    const { overscan } = deps;
    if (overscan >= RECOMMENDED_SCALED_OVERSCAN) return;
    const totalRows = deps.getTotalRows().toLocaleString();
    console.warn(
      `[gp-grid] Scroll virtualization is active (${totalRows} rows) ` +
      `but overscan is ${overscan}. Fast momentum scrolling can outrun rendering and show blank rows ` +
      `at this scale — set the overscan option to 10–12.`,
    );
  };
};
