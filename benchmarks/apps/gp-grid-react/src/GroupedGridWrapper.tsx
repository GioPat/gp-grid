import { useEffect, useMemo, useRef, useState } from "react";
import * as gpGrid from "@gp-grid/react";
import "@gp-grid/react/dist/styles.css";
import type { ColumnDefinition, GridRef } from "@gp-grid/react";
import { generateData, type BenchmarkRow } from "../../../src/data/generate-data";
import { toGpGridColumns, BENCHMARK_COLUMNS } from "../../../src/data/column-definitions";
import benchmarkDefaults from "../../../src/config/benchmark-defaults.json";
import type { BenchmarkGridApi } from "../../../src/data/types";
import { waitForBrowserIdle } from "../../../src/data/row-processing";

interface GroupedGridWrapperProps {
  initialRowCount: number;
}

interface RowGroupsBenchmarkApi {
  /** `"unchanged"` proves every group was already expanded. */
  expandAll(): string;
}

interface GroupedCore {
  rows: { getCount(): number };
  viewport: { getScrollRatio(): number };
  rowGroups: { setExpanded(ids: null, expanded: boolean): { status: string } };
}

// Low cardinality: 8 departments x 44 ages, fully expanded, with a top total row.
const GROUPING_CONFIG = {
  dimensions: [{ field: "department" }, { field: "age" }],
  measures: [
    { field: "salary", aggregate: "sum" },
    { field: "rating", aggregate: "avg" },
  ],
  defaultExpandedDepth: 2,
  grandTotal: "top",
};

// The benchmark app type-checks against the published package, which has no row grouping yet.
const { createRowGrouping } = gpGrid as unknown as {
  createRowGrouping?: (config: typeof GROUPING_CONFIG) => unknown;
};

const unsupported = (): never => {
  throw new Error("Row grouping is unavailable in the resolved @gp-grid/react; run with BENCH_SOURCE=candidate.");
};

const notMeasured = async (): Promise<void> => unsupported();

export function GroupedGridWrapper({ initialRowCount }: GroupedGridWrapperProps) {
  const [data, setData] = useState<BenchmarkRow[]>([]);
  const gridRef = useRef<GridRef<BenchmarkRow> | null>(null);
  const columns = useMemo(() => toGpGridColumns(BENCHMARK_COLUMNS) as ColumnDefinition[], []);
  const dataSource = useMemo(() => gpGrid.createClientDataSource(data), [data]);
  const groupingProps = useMemo(() => ({ rowGrouping: (createRowGrouping ?? unsupported)(GROUPING_CONFIG) }), []);

  useEffect(() => {
    if (initialRowCount > 0) setData(generateData(initialRowCount));
  }, [initialRowCount]);

  useEffect(() => {
    const core = (): GroupedCore | undefined => gridRef.current?.core as unknown as GroupedCore | undefined;
    const api: BenchmarkGridApi & RowGroupsBenchmarkApi = {
      loadData: (count) => setData(generateData(count)),
      clearData: () => setData([]),
      sort: notMeasured,
      sortMany: notMeasured,
      clearSort: notMeasured,
      filter: notMeasured,
      clearFilters: notMeasured,
      isReady: () => document.querySelectorAll(".gp-grid-row--group").length > 0,
      waitForIdle: waitForBrowserIdle,
      getRowCount: () => data.length,
      getScrollRatio: () => core()?.viewport.getScrollRatio() ?? 1,
      getDisplayedRowCount: () => core()?.rows.getCount() ?? 0,
      getDisplayedRows: () => [],
      expandAll: () => core()?.rowGroups.setExpanded(null, true).status ?? "unsupported",
    };
    window.gridApi = api;
  }, [data.length]);

  return (
    <div data-testid="grid-container" style={{ width: "100%", height: "100%" }}>
      <gpGrid.Grid
        gridRef={gridRef}
        columns={columns}
        dataSource={dataSource}
        rowHeight={benchmarkDefaults.rowHeightPx}
        headerHeight={40}
        overscan={benchmarkDefaults.overscanRows}
        {...groupingProps}
      />
    </div>
  );
}
