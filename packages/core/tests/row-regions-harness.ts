// packages/core/tests/row-regions-harness.ts
// Shared fixture for the row-region mapping suites: a real RowGeometry over
// injected numeric deps, so every suite measures the same construction.

import { createRowGeometry, type RowGeometryDeps } from "../src/geometry/row-geometry";
import type { RowRegionMappingInput } from "../src/geometry/row-regions-mapping";

export interface HarnessOptions {
  rowCount?: number;
  rowHeight?: number;
  viewportHeight?: number;
  domScrollTop?: number;
  overscan?: number;
  ratio?: number;
}

export const createHarness = (options: HarnessOptions = {}) => {
  const rowCount = options.rowCount ?? 1000;
  const rowHeight = options.rowHeight ?? 32;
  const viewportHeight = options.viewportHeight ?? 320;
  const ratio = options.ratio;
  const deps: RowGeometryDeps = {
    getRowCount: () => rowCount,
    getRowHeight: () => rowHeight,
    getViewportHeight: () => viewportHeight,
    getSuffixViewportHeight: () => viewportHeight,
    getOverscan: () => options.overscan ?? 3,
    mapping: {
      getDomScrollTop: () => options.domScrollTop ?? 0,
      toDomScrollTop: (logical) => logical * (ratio ?? 1),
      toLogicalScrollTop: (dom) => (ratio !== undefined && ratio < 1 ? dom / ratio : dom),
      isScalingActive: () => ratio !== undefined && ratio < 1,
      getMaxLogicalScrollTop: () => Math.max(0, rowCount * rowHeight - viewportHeight),
    },
  };
  const rows = createRowGeometry(deps);
  rows.syncAxis();
  return {
    rows,
    axis: rows.getAxis(),
    mapper: rows.getMapper(),
    rowCount,
    rowHeight,
    viewportHeight,
    domScrollTop: options.domScrollTop ?? 0,
    overscan: options.overscan ?? 3,
  };
};

export type Harness = ReturnType<typeof createHarness>;

export const frameInput = (
  harness: Harness,
  frame: { frozenCount: number; viewportHeight?: number; overscan?: number },
): RowRegionMappingInput => ({
  axis: harness.axis,
  mapper: harness.mapper,
  frozenCount: Math.min(frame.frozenCount, harness.axis.count),
  frozenExtent: harness.axis.getOffset(Math.min(frame.frozenCount, harness.axis.count)),
  viewportHeight: frame.viewportHeight ?? harness.viewportHeight,
  scrollTop: harness.domScrollTop,
  overscan: frame.overscan ?? 0,
});
