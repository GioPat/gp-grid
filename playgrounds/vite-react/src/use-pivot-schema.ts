// playgrounds/vite-react/src/use-pivot-schema.ts
// A pivot source's schema as React state: the current one at mount, then each
// notification, for the grid's `columns` and `columnGroups` props.

import { useEffect, useState } from "react";
import type { PivotSchema, PivotSource } from "@gp-grid/react";

export type PivotSchemaSource = Pick<PivotSource<unknown>, "getSchema" | "subscribeSchema">;

export const EMPTY_PIVOT_SCHEMA: PivotSchema = { columns: [], columnGroups: [] };

/** `onNotify` must be stable: a new one resubscribes. */
export const usePivotSchema = (source: PivotSchemaSource | null, onNotify?: () => void): PivotSchema => {
  const [schema, setSchema] = useState<PivotSchema>(() => source?.getSchema() ?? EMPTY_PIVOT_SCHEMA);
  useEffect(() => {
    // The grid's first query may have published before this effect ran.
    setSchema(source?.getSchema() ?? EMPTY_PIVOT_SCHEMA);
    if (source === null) return undefined;
    return source.subscribeSchema((next) => {
      onNotify?.();
      setSchema(next);
    });
  }, [source, onNotify]);
  return schema;
};
