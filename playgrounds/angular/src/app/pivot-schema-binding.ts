// playgrounds/angular/src/app/pivot-schema-binding.ts
// A pivot source's schema as a signal: the current one when a source is bound,
// then each notification, for the grid's `columns` and `columnGroups` inputs.

import { signal, type Signal } from "@angular/core";
import type { PivotSchema, PivotSource } from "@gp-grid/angular";

export type PivotSchemaSource = Pick<PivotSource<unknown>, "getSchema" | "subscribeSchema">;

export const EMPTY_PIVOT_SCHEMA: PivotSchema = { columns: [], columnGroups: [] };

export interface PivotSchemaBinding {
  readonly schema: Signal<PivotSchema>;
  bind(source: PivotSchemaSource | null): void;
  /** Call from `ngOnDestroy`. */
  clear(): void;
}

export const createPivotSchemaBinding = (onNotify?: () => void): PivotSchemaBinding => {
  const schema = signal<PivotSchema>(EMPTY_PIVOT_SCHEMA);
  let stop: (() => void) | undefined;
  const clear = (): void => {
    stop?.();
    stop = undefined;
    schema.set(EMPTY_PIVOT_SCHEMA);
  };
  return {
    schema: schema.asReadonly(),
    bind: (source) => {
      clear();
      schema.set(source?.getSchema() ?? EMPTY_PIVOT_SCHEMA);
      stop = source?.subscribeSchema((next) => {
        onNotify?.();
        schema.set(next);
      });
    },
    clear,
  };
};
