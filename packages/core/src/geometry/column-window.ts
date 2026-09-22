// packages/core/src/geometry/column-window.ts
// The mounted column window: displayed-index range plus bounded retention,
// resolved once per layout so raw scrolling only binary-searches.

import type {
  AxisBounds,
  ColumnLayoutSnapshot,
  ColumnWindowSnapshot,
  DisplayedColumn,
} from "../types/geometry";
import { buildCenterOffsets, resolveCenterRange } from "./column-range";
import { clampScroll } from "./viewport-sample";

export {
  buildCenterOffsets,
  resolveCenterRange,
  UNMEASURED_CENTER_EXTENT,
} from "./column-range";
export type { CenterRangeInput } from "./column-range";

/** Bounded number of keep-alive keys; excess registrations are ignored. */
export const MAX_RETENTION_KEYS = 16;

/** Total retained columns across every key; the budget is per grid, not per key. */
export const MAX_RETAINED_COLUMNS = 16;

/**
 * The active editor's key, always read first: a bulk registration must never
 * evict the editor the user is typing into.
 */
const EDIT_RETENTION_KEY = "edit";

/**
 * Merge retained columns into a resolved range, in displayed order. Retained
 * ids outside the center region are ignored, so retention can never mount a
 * hidden or pinned column twice. `centerIndexOf` addresses a retained id
 * directly so the merge cost follows the bounded retained set, not the
 * layout.
 */
export const mergeRetained = <TColumn extends DisplayedColumn>(
  columns: readonly TColumn[],
  range: AxisBounds,
  centerEnd: number,
  retained: readonly string[],
  centerIndexOf: (columnId: string) => number | undefined,
): TColumn[] => {
  const center: TColumn[] = [];
  for (let index = range.start; index < range.end; index++) {
    center.push(columns[index]!);
  }
  if (retained.length === 0) return center;

  const extra: TColumn[] = [];
  for (const columnId of retained) {
    const index = centerIndexOf(columnId);
    if (index === undefined || index >= centerEnd) continue;
    if (range.start <= index && index < range.end) continue;
    extra.push(columns[index]!);
  }
  if (extra.length === 0) return center;
  // Both sides are in displayed order, so a linear merge restores one ordered
  // set without re-sorting the (unbounded) resolved range.
  extra.sort((a, b) => a.offset - b.offset);
  const merged: TColumn[] = [];
  let centerAt = 0;
  let extraAt = 0;
  while (centerAt < center.length && extraAt < extra.length) {
    merged.push(
      center[centerAt]!.offset <= extra[extraAt]!.offset
        ? center[centerAt++]!
        : extra[extraAt++]!,
    );
  }
  while (centerAt < center.length) merged.push(center[centerAt++]!);
  while (extraAt < extra.length) merged.push(extra[extraAt++]!);
  return merged;
};

/**
 * The mounted column window for a layout and a displayed-index range. The
 * same object is returned while the layout, the range and the retained set
 * are unchanged.
 */
export const resolveColumnWindow = (
  layout: ColumnLayoutSnapshot,
  range: AxisBounds,
  retained: readonly string[] = [],
  centerIndexOf: (columnId: string) => number | undefined = () => undefined,
): ColumnWindowSnapshot => ({
  layout,
  range,
  start: layout.columns.slice(0, layout.regions.centerStart),
  center: mergeRetained(
    layout.columns,
    range,
    layout.regions.centerEnd,
    retained,
    centerIndexOf,
  ),
  end: layout.columns.slice(layout.regions.centerEnd),
});

export interface ColumnWindowResolverDeps {
  /** Current resolved layout; the same object while nothing observable changed. */
  getLayout(): ColumnLayoutSnapshot;
  /** Raw horizontal scroll sample, before clamping. */
  getScrollLeft(): number;
  /** Raw viewport width; `0` while the body has not been measured. */
  getViewportWidth(): number;
  getOverscan(): number;
}

export interface ColumnWindowResolver {
  get(): ColumnWindowSnapshot;
  /** Effective (clamped) horizontal scroll sample queries are answered from. */
  getScrollLeft(): number;
  /** Clamp an arbitrary horizontal sample into the center's reachable range. */
  clampScrollLeft(scrollLeft: number): number;
  /** Recompute the window and report whether it replaced the previous one. */
  commit(): boolean;
  /** Bounded, keyed keep-alive of center columns mounted outside the range. */
  retain(key: string, columnIds: readonly string[]): void;
}

const isSameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, index) => id === b[index]);

const isSameWindow = (a: AxisBounds, b: AxisBounds): boolean =>
  a.start === b.start && a.end === b.end;

/**
 * Owns the center prefix sums, the clamped scroll sample and the mounted
 * window. Prefixes and the center index are rebuilt only when the layout
 * changes, so raw scrolling costs two binary searches. Retained columns are
 * keyed and bounded in total, so a bulk key cannot evict the active edit.
 */
export const createColumnWindowResolver = (
  deps: ColumnWindowResolverDeps,
): ColumnWindowResolver => {
  const retainedKeys = new Map<string, readonly string[]>();
  let prefixCache: { layout: ColumnLayoutSnapshot; offsets: number[]; total: number } | null = null;
  let indexCache: { layout: ColumnLayoutSnapshot; index: Map<string, number> } | null = null;
  let cache: {
    layout: ColumnLayoutSnapshot;
    range: AxisBounds;
    retained: readonly string[];
    window: ColumnWindowSnapshot;
  } | null = null;
  let committed: ColumnWindowSnapshot | null = null;

  const prefixes = (layout: ColumnLayoutSnapshot) => {
    if (prefixCache?.layout !== layout) {
      const offsets = buildCenterOffsets(
        layout.columns,
        layout.regions.centerStart,
        layout.regions.centerEnd,
      );
      prefixCache = { layout, offsets, total: offsets.at(-1) ?? 0 };
    }
    return prefixCache;
  };

  /** Displayed index per center column id, built once per layout. */
  const centerLocations = (layout: ColumnLayoutSnapshot): Map<string, number> => {
    if (indexCache?.layout !== layout) {
      const index = new Map<string, number>();
      for (let at = layout.regions.centerStart; at < layout.regions.centerEnd; at++) {
        index.set(layout.columns[at]!.columnId, at);
      }
      indexCache = { layout, index };
    }
    return indexCache.index;
  };

  /**
   * The retained set: the editor key first, then the newest registration, so
   * a bulk measurement key cannot evict the active edit. The union is
   * bounded, and so is what a single key may register.
   */
  const retainedIds = (): string[] => {
    const ids: string[] = [];
    const seen = new Set<string>();
    const keys = [...retainedKeys.keys()].sort((a, b) => {
      if (a === EDIT_RETENTION_KEY) return -1;
      if (b === EDIT_RETENTION_KEY) return 1;
      return 0;
    });
    for (const key of keys) {
      for (const columnId of retainedKeys.get(key)!) {
        if (ids.length >= MAX_RETAINED_COLUMNS) return ids;
        if (seen.has(columnId)) continue;
        seen.add(columnId);
        ids.push(columnId);
      }
    }
    return ids;
  };

  const clampScrollLeft = (scrollLeft: number): number => {
    const layout = deps.getLayout();
    const { total } = prefixes(layout);
    return clampScroll(scrollLeft, Math.max(0, total - layout.regions.centerViewportWidth));
  };

  const scrollLeft = (): number => clampScrollLeft(deps.getScrollLeft());

  const resolve = (): ColumnWindowSnapshot => {
    const layout = deps.getLayout();
    const { offsets, total } = prefixes(layout);
    const width = deps.getViewportWidth();
    const centerRange = resolveCenterRange({
      offsets,
      centerTotal: total,
      scrollLeft: scrollLeft(),
      // A negative width marks an unmeasured viewport: the window falls back
      // to a fixed pixel extent instead of mounting nothing.
      centerViewportWidth: width > 0 ? layout.regions.centerViewportWidth : -1,
      overscan: deps.getOverscan(),
    });
    // The prefix axis and `resolveCenterRange` are center-local; the window
    // indexes the whole displayed layout. An empty center stays empty.
    const offset = centerRange.end > centerRange.start ? layout.regions.centerStart : 0;
    const range: AxisBounds = {
      start: centerRange.start + offset,
      end: centerRange.end + offset,
    };
    const retained = retainedIds();
    const previous = cache;
    if (
      previous !== null &&
      previous.layout === layout &&
      isSameWindow(previous.range, range) &&
      isSameIds(previous.retained, retained)
    ) {
      return previous.window;
    }
    const centerIndexOf = centerLocations(layout);
    const window = resolveColumnWindow(
      layout,
      range,
      retained,
      (columnId) => centerIndexOf.get(columnId),
    );
    cache = { layout, range, retained, window };
    return window;
  };

  return {
    get: resolve,
    getScrollLeft: scrollLeft,
    clampScrollLeft,
    commit: () => {
      const next = resolve();
      const moved = next !== committed;
      committed = next;
      return moved;
    },
    retain: (key, columnIds) => {
      const previous = retainedKeys.get(key);
      if (previous === undefined && retainedKeys.size >= MAX_RETENTION_KEYS) return;
      if (columnIds.length === 0) {
        if (previous === undefined) return;
        retainedKeys.delete(key);
      } else {
        if (previous !== undefined && isSameIds(previous, columnIds)) return;
        retainedKeys.set(key, columnIds.slice(0, MAX_RETAINED_COLUMNS));
      }
      // Identity is the change contract: force the next resolve to rebuild.
      cache = null;
      committed = null;
    },
  };
};
