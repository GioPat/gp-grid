// packages/core/src/geometry/column-layout.ts
// Pure column-layout resolution plus the caching resolver that owns snapshot
// reuse and revision assignment. Layout changes are only published when an
// observable render input changed — equal ids/widths alone are not enough.

import type { ColumnDefinition } from "../types/columns";
import type {
  ColumnLayoutMode,
  ColumnLayoutSnapshot,
  DisplayedColumn,
} from "../types/geometry";
import { getColumnId } from "../column-model";
import { resolveColumnWidths, type WidthSource } from "./column-widths";

export interface ColumnLayoutInput {
  /**
   * Raw resolved layout, including hidden columns. The caching resolver keys
   * on this array's identity: the owner must supply a new array whenever a
   * definition, order, visibility or width override changes.
   */
  readonly columns: readonly ColumnDefinition[];
  readonly mode: ColumnLayoutMode;
  readonly width: number;
  /** Width override membership per resolved-layout index. */
  readonly isOverridden: (layoutIndex: number) => boolean;
}

const buildDisplayedColumns = (input: ColumnLayoutInput): DisplayedColumn[] => {
  const sources: WidthSource[] = [];
  const indices: number[] = [];
  for (let layoutIndex = 0; layoutIndex < input.columns.length; layoutIndex++) {
    const column = input.columns[layoutIndex]!;
    if (column.hidden) continue;
    sources.push({
      columnId: getColumnId(column),
      hidden: false,
      width: column.width,
      overridden: input.isOverridden(layoutIndex),
    });
    indices.push(layoutIndex);
  }

  const widths = resolveColumnWidths(sources, input.mode, input.width);
  const displayed: DisplayedColumn[] = [];
  let offset = 0;
  for (let i = 0; i < sources.length; i++) {
    const width = widths[i]!;
    displayed.push({
      columnId: sources[i]!.columnId,
      layoutIndex: indices[i]!,
      column: input.columns[indices[i]!]!,
      offset,
      width,
    });
    offset += width;
  }
  return displayed;
};

const isSameLayout = (
  previous: ColumnLayoutSnapshot,
  mode: ColumnLayoutMode,
  columns: readonly DisplayedColumn[],
  totalWidth: number,
): boolean => {
  if (previous.mode !== mode || previous.totalWidth !== totalWidth) return false;
  if (previous.columns.length !== columns.length) return false;
  for (let i = 0; i < columns.length; i++) {
    const before = previous.columns[i]!;
    const after = columns[i]!;
    if (
      before.columnId !== after.columnId ||
      before.layoutIndex !== after.layoutIndex ||
      before.column !== after.column ||
      before.offset !== after.offset ||
      before.width !== after.width
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
  const columns = buildDisplayedColumns(input);
  const totalWidth = columns.reduce((total, column) => total + column.width, 0);
  if (previous !== null && isSameLayout(previous, input.mode, columns, totalWidth)) {
    return previous;
  }
  return { revision, mode: input.mode, columns, totalWidth };
};

/**
 * Resolve a displayed layout for a definition-only seed (SSR's deterministic
 * first render) where no live override exists and the model is not yet built.
 */
export const createSeedColumnLayout = (
  columns: readonly ColumnDefinition[],
  mode: ColumnLayoutMode,
  viewportWidth: number,
): ColumnLayoutSnapshot =>
  resolveColumnLayout(
    { columns, mode, width: viewportWidth, isOverridden: () => false },
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
 */
export const createColumnLayoutResolver = (
  initialMode: ColumnLayoutMode,
  nextRevision: () => number,
): ColumnLayoutResolver => {
  let mode = initialMode;
  let width = 0;
  let columns: readonly ColumnDefinition[] = [];
  let isOverridden: (layoutIndex: number) => boolean = () => false;
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
      const isUnchanged =
        input.columns === columns && input.width === width && mode === resolvedMode;
      if (layout !== null && isUnchanged) return layout;
      columns = input.columns;
      width = input.width;
      isOverridden = input.isOverridden;
      // `mode` is NOT copied from the input: it is owned by `setMode`, so a
      // staged mode change cannot be lost by an interleaved `update` call.
      return resolve();
    },
  };
};
