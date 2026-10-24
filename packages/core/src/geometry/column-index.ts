// packages/core/src/geometry/column-index.ts
// Lookup structures over one column layout snapshot: a prefix axis for
// x → displayed index and a map for layout index → displayed column. Built
// once per snapshot, never per query.

import type { ColumnLayoutSnapshot, DisplayedColumn } from "../types/geometry";
import { createPrefixAxis } from "./prefix-axis";

export interface ColumnIndex {
  /** Displayed index at content `x`: `-1` before the columns or with none, `count` at/past the end. */
  indexAt(x: number): number;
  byLayoutIndex(layoutIndex: number): DisplayedColumn | undefined;
}

export const createColumnIndex = (layout: ColumnLayoutSnapshot): ColumnIndex => {
  const axis = createPrefixAxis(layout.columns.map((column) => column.width));
  const displayed = new Map(layout.columns.map((column) => [column.layoutIndex, column]));
  return {
    indexAt: (x) => (axis.count === 0 ? -1 : axis.indexAt(x)),
    byLayoutIndex: (layoutIndex) => displayed.get(layoutIndex),
  };
};
