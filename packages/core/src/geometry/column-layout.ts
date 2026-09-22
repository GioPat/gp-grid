// packages/core/src/geometry/column-layout.ts
// Pure column-layout resolution plus the caching resolver that owns snapshot
// reuse and revision assignment. Layout changes are only published when an
// observable render input changed — equal ids/widths alone are not enough.

import type { ColumnDefinition } from "../types/columns";
import type {
  ColumnLayoutMode,
  ColumnLayoutSnapshot,
  ColumnPin,
  ColumnRegionLayout,
  DisplayedColumn,
  ResolvedColumn,
} from "../types/geometry";
import { getColumnId } from "../column-model";
import { resolveColumnWidths } from "./column-widths";
import { getColumnRegionLayout, regionAtIndex } from "./column-regions";

/** Fallback pin lookup: the resolved definition carries the effective pin. */
const pinOfColumn = (column: ColumnDefinition): ColumnPin | null => column.pinned ?? null;

export interface ColumnLayoutInput {
  /** Raw resolved layout, including hidden columns. */
  readonly columns: readonly ColumnDefinition[];
  readonly mode: ColumnLayoutMode;
  readonly width: number;
  /** Width override membership per source-layout index. */
  readonly isOverridden: (layoutIndex: number) => boolean;
}

const pinRank = (column: ColumnDefinition): number => {
  const pin = pinOfColumn(column);
  if (pin === "start") return 0;
  if (pin === "end") return 2;
  return 1;
};

const buildDisplayedColumns = (input: ColumnLayoutInput): DisplayedColumn[] => {
  // The displayed layout is the source layout partitioned by requested pin,
  // hidden columns included: both the seed and the live model partition every
  // column, so `layoutIndex` — the index space of `CellPosition.col` — is the
  // position in that partition and a hidden column keeps its slot.
  const ordered = input.columns
    .map((column, sourceIndex) => ({ column, sourceIndex, rank: pinRank(column) }))
    .sort((a, b) => (a.rank === b.rank ? a.sourceIndex - b.sourceIndex : a.rank - b.rank))
    .map((entry, layoutIndex) => ({ ...entry, layoutIndex }));

  const visible = ordered.filter((entry) => entry.column.hidden !== true);
  const widths = resolveColumnWidths(
    visible.map((entry) => ({
      columnId: getColumnId(entry.column),
      hidden: false,
      width: entry.column.width,
      overridden: input.isOverridden(entry.sourceIndex),
    })),
    input.mode,
    input.width,
  );

  const displayed: DisplayedColumn[] = [];
  let offset = 0;
  for (let index = 0; index < visible.length; index++) {
    const { column, layoutIndex } = visible[index]!;
    const width = widths[index]!;
    displayed.push({
      columnId: getColumnId(column),
      layoutIndex,
      column,
      offset,
      width,
    });
    offset += width;
  }
  return displayed;
};

/** Attach the admitted region and its region-local inline offset. */
const withRegions = (
  columns: readonly DisplayedColumn[],
  regions: ColumnRegionLayout,
  totalWidth: number,
): ResolvedColumn[] => {
  const endRegionStart = totalWidth - regions.endWidth;
  return columns.map((column, index) => {
    const region = regionAtIndex(index, regions.centerStart, regions.centerEnd);
    return {
      ...column,
      region,
      regionOffset: region === "end" ? column.offset - endRegionStart : column.offset,
    };
  });
};

const isSameRegions = (a: ColumnRegionLayout, b: ColumnRegionLayout): boolean =>
  a.centerStart === b.centerStart &&
  a.centerEnd === b.centerEnd &&
  a.startWidth === b.startWidth &&
  a.endWidth === b.endWidth &&
  a.endOffset === b.endOffset &&
  a.centerViewportWidth === b.centerViewportWidth;

const isSameLayout = (
  previous: ColumnLayoutSnapshot,
  mode: ColumnLayoutMode,
  columns: readonly ResolvedColumn[],
  totalWidth: number,
  regions: ColumnRegionLayout,
): boolean => {
  if (previous.mode !== mode || previous.totalWidth !== totalWidth) return false;
  if (isSameRegions(previous.regions, regions) === false) return false;
  if (previous.columns.length !== columns.length) return false;
  for (let i = 0; i < columns.length; i++) {
    const before = previous.columns[i]!;
    const after = columns[i]!;
    if (
      before.columnId !== after.columnId ||
      before.layoutIndex !== after.layoutIndex ||
      before.column !== after.column ||
      before.offset !== after.offset ||
      before.width !== after.width ||
      before.region !== after.region ||
      before.regionOffset !== after.regionOffset
    ) {
      return false;
    }
  }
  return true;
};

/** Replace the previous snapshot only when the render contract differs. */
export const resolveColumnLayout = (
  input: ColumnLayoutInput,
  previous: ColumnLayoutSnapshot | null,
  revision: number,
): ColumnLayoutSnapshot => {
  const base = buildDisplayedColumns(input);
  const totalWidth = base.reduce((total, column) => total + column.width, 0);
  const regions = getColumnRegionLayout(base, input.width, totalWidth);
  const columns = withRegions(base, regions, totalWidth);
  if (previous !== null && isSameLayout(previous, input.mode, columns, totalWidth, regions)) {
    return previous;
  }
  return { revision, mode: input.mode, columns, totalWidth, regions };
};

const notOverridden = (): boolean => false;

/**
 * Resolve a displayed layout for a definition-only seed (SSR's deterministic
 * first render) where no live override exists and the model is not yet built.
 * A declared definition pin still admits, so SSR markup matches the mount.
 */
export const createSeedColumnLayout = (
  columns: readonly ColumnDefinition[],
  mode: ColumnLayoutMode,
  viewportWidth: number,
): ColumnLayoutSnapshot =>
  resolveColumnLayout(
    { columns, mode, width: viewportWidth, isOverridden: notOverridden },
    null,
    0,
  );

export interface ColumnLayoutResolver {
  get(): ColumnLayoutSnapshot;
  /** Re-resolve against the supplied layout/mode/viewport width. */
  update(input: ColumnLayoutInput): ColumnLayoutSnapshot;
  setMode(mode: ColumnLayoutMode): void;
  getMode(): ColumnLayoutMode;
}

/**
 * Caches one snapshot. `nextRevision` runs only when the snapshot is replaced,
 * so a column change always advances the caller's geometry revision and a
 * reused snapshot keeps the revision of its last change.
 *
 * The supplied `columns` array carries the change signal: the model replaces
 * it whenever the resolved layout changes and reuses it otherwise, so a scroll
 * sample never re-resolves. The comparator below still returns the previous
 * snapshot when the render contract is unchanged.
 */
export const createColumnLayoutResolver = (
  initialMode: ColumnLayoutMode,
  nextRevision: () => number,
): ColumnLayoutResolver => {
  let mode = initialMode;
  let width = -1;
  let columns: readonly ColumnDefinition[] = [];
  let isOverridden: (layoutIndex: number) => boolean = notOverridden;
  let layout: ColumnLayoutSnapshot | null = null;
  let resolvedMode: ColumnLayoutMode | null = null;

  const resolve = (): ColumnLayoutSnapshot => {
    const resolved = resolveColumnLayout(
      { columns, mode, width, isOverridden },
      layout,
      layout?.revision ?? 0,
    );
    resolvedMode = mode;
    if (resolved !== layout) layout = { ...resolved, revision: nextRevision() };
    return layout;
  };

  return {
    get: () => layout ?? resolve(),
    getMode: () => mode,
    setMode: (next) => {
      mode = next;
    },
    update: (input) => {
      // `mode` is NOT copied from the input: it is owned by `setMode`, so a
      // staged mode change cannot be lost by an interleaved `update` call.
      const isUnchanged =
        input.columns === columns && input.width === width && mode === resolvedMode;
      if (isUnchanged) return layout ?? resolve();
      columns = input.columns;
      isOverridden = input.isOverridden;
      width = input.width;
      return resolve();
    },
  };
};
