// playgrounds/vite-vue/src/use-pivot-schema.ts
// A pivot source's schema as a ref: the current one when the source is bound,
// then each notification, for the grid's `columns` and `column-groups` props.

import { onUnmounted, shallowRef, toValue, watch, type MaybeRefOrGetter, type ShallowRef } from "vue";
import type { PivotSchema, PivotSource } from "@gp-grid/vue";

export type PivotSchemaSource = Pick<PivotSource<unknown>, "getSchema" | "subscribeSchema">;

export const EMPTY_PIVOT_SCHEMA: PivotSchema = { columns: [], columnGroups: [] };

export const usePivotSchema = (
  source: MaybeRefOrGetter<PivotSchemaSource | null>,
  onNotify?: () => void,
): ShallowRef<PivotSchema> => {
  const schema = shallowRef<PivotSchema>(EMPTY_PIVOT_SCHEMA);
  let stop: (() => void) | undefined;
  watch(
    () => toValue(source),
    (next) => {
      stop?.();
      stop = undefined;
      schema.value = next?.getSchema() ?? EMPTY_PIVOT_SCHEMA;
      stop = next?.subscribeSchema((current) => {
        onNotify?.();
        schema.value = current;
      });
    },
    { immediate: true },
  );
  onUnmounted(() => {
    stop?.();
    stop = undefined;
  });
  return schema;
};
