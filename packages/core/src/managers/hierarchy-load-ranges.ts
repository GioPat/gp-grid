// packages/core/src/managers/hierarchy-load-ranges.ts
// The view rows a hierarchy is asked to load (PRD 009 D3).

import type { AxisBounds } from "../types/geometry";
import type { RowLoadContext } from "./row-window-loader";

/** The frozen prefix when one applies, then the overscan window; never the gap between them. */
export const hierarchyLoadRanges = (context: RowLoadContext, rowCount: number): AxisBounds[] => {
  const ranges: AxisBounds[] = [];
  const frozenEnd = Math.min(context.regions.frozenCount, rowCount);
  if (frozenEnd > 0) ranges.push({ start: 0, end: frozenEnd });
  const start = Math.max(context.overscanWindow.start, 0);
  const end = Math.min(context.overscanWindow.end, rowCount);
  if (end > start) ranges.push({ start, end });
  return ranges;
};
