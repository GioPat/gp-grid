// packages/core/src/utils/scroll-helpers.ts

import type { GridCore } from "../grid-core";

/**
 * Scroll a cell into view on both axes using the geometry service.
 *
 * `from` is the DOM scroll sample the adapter is about to apply; passing it
 * keeps the target consistent with a scroll event that has not been reported
 * to the core yet. Axes the target omits are left untouched, so native
 * scrolling carries them along — including compressed vertical scrolling,
 * where the DOM value is not proportional to the logical one.
 */
export const scrollCellIntoView = <TData>(
  core: GridCore<TData>,
  container: HTMLElement,
  row: number,
  col: number,
  from?: { scrollTop?: number; scrollLeft?: number },
): void => {
  const target = core.geometry.getScrollTarget(row, col, {
    scrollTop: from?.scrollTop ?? container.scrollTop,
    scrollLeft: from?.scrollLeft ?? container.scrollLeft,
  });
  if (target.scrollTop !== undefined) container.scrollTop = target.scrollTop;
  if (target.scrollLeft !== undefined) container.scrollLeft = target.scrollLeft;
};
