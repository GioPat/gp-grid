// packages/vue/src/composables/useColumnSchemaSync.ts
// Runtime `columns`, `columnGroups` and `headerBandHeights` changes, shared by
// `GpGrid` and `useGpGrid`. Creation already received the current values.

import { watch, type ShallowRef } from "vue";
import type { ColumnDefinition, ColumnGroupChild, GridCore } from "@gp-grid/core";

export interface ColumnSchemaSources {
  columns: () => ColumnDefinition[];
  columnGroups: () => readonly ColumnGroupChild[] | undefined;
  headerBandHeights: () => readonly number[] | undefined;
}

/** Push schema and band height changes into the core without recreating it. */
export const useColumnSchemaSync = <TData>(
  coreRef: Readonly<ShallowRef<GridCore<TData> | null>>,
  sources: ColumnSchemaSources,
): void => {
  // One call, so the hierarchy is validated against the new column ids. The
  // core reconciles by column id and keeps user state, sort, filter and scroll.
  watch([sources.columns, sources.columnGroups], ([columns, groups]) => {
    coreRef.value?.columns.set(columns, groups ?? null);
  });

  watch(sources.headerBandHeights, (heights) => {
    coreRef.value?.header.setBandHeights(heights ?? []);
  });
};
