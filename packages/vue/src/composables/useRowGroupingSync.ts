// packages/vue/src/composables/useRowGroupingSync.ts
// Row grouping wiring shared by `GpGrid` and `useGpGrid` (PRD 008).

import { computed, watch, type ComputedRef, type ShallowRef } from "vue";
import type {
  ColumnDefinition,
  ColumnLayoutSnapshot,
  GridCore,
  GridLabels,
  RowGrouping,
} from "@gp-grid/core";
import { resolveGroupLabelColumnId } from "@gp-grid/core";
import type { RowGroupCellContext } from "../components/row-group-attributes";
import type { VueGroupLabelRenderer } from "../types";

type CoreRef<TData> = Readonly<ShallowRef<GridCore<TData> | null>>;

/** A later `rowGrouping` reaches the current core through `setGrouping`, never a new core. */
export const useRowGroupingSync = <TData>(
  coreRef: CoreRef<TData>,
  rowGrouping: () => RowGrouping | null | undefined,
): void => {
  watch(rowGrouping, (grouping) => {
    coreRef.value?.rowGroups.setGrouping(grouping ?? null);
  });
};

/** Mirrors `InputEventAdapter.groupTogglePointerDown`: the cell beneath sees no pointer down. */
export const createGroupTogglePointerDown = <TData>(coreRef: CoreRef<TData>) =>
  (rowIndex: number, e: PointerEvent): void => {
    e.stopPropagation();
    if (e.button !== 0) return;
    coreRef.value?.input.handleGroupToggle(rowIndex);
  };

export interface RowGroupCellSources {
  hierarchical: () => boolean;
  layout: () => ColumnLayoutSnapshot | null;
  columns: () => readonly ColumnDefinition[];
  labels: () => GridLabels;
  groupLabelColumn: () => string | undefined;
  groupLabelRenderer: () => VueGroupLabelRenderer | undefined;
}

/** What the cells of a hierarchy share; `null` while the grid is flat. */
export const useRowGroupCellContext = <TData>(
  coreRef: CoreRef<TData>,
  sources: RowGroupCellSources,
): ComputedRef<RowGroupCellContext | null> => {
  const onTogglePointerDown = createGroupTogglePointerDown(coreRef);
  const onToggle = (rowIndex: number): void => {
    coreRef.value?.input.handleGroupToggle(rowIndex);
  };

  return computed(() => {
    const layout = sources.layout();
    if (sources.hierarchical() === false || layout === null) return null;
    return {
      labelColumnId: resolveGroupLabelColumnId(layout, sources.groupLabelColumn()),
      labels: sources.labels(),
      columns: sources.columns(),
      renderer: sources.groupLabelRenderer(),
      onTogglePointerDown,
      onToggle,
    };
  });
};
