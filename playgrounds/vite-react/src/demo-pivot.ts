// playgrounds/vite-react/src/demo-pivot.ts
// The "Pivot" demo (PRD 012): the demo's own rows folded by status and name,
// one column group per creation date, salary summed and age averaged.

import { createPivotSource } from "@gp-grid/react";
import type { DataSource, PivotConfig, PivotSource } from "@gp-grid/react";

const demoPivotConfig: PivotConfig = {
  rows: [{ field: "status" }, { field: "name" }],
  pivots: [{ field: "createdAt" }],
  measures: [
    { field: "salary", aggregate: "sum" },
    { field: "age", aggregate: "avg" },
  ],
  rowTotals: true,
  grandTotal: "top",
  labelColumn: { headerName: "Status / Name" },
};

export const createDemoPivotSource = <TData>(source: DataSource<TData>): PivotSource<TData> =>
  createPivotSource(source, demoPivotConfig);
