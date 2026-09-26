import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Grid, createClientDataSource } from "@gp-grid/react";
import "@gp-grid/react/dist/styles.css";
import type { GridRef, FilterCondition as CoreFilterCondition, ColumnDefinition, DataSource } from "@gp-grid/react";
import {
  generateData,
  type BenchmarkRow,
} from "../../../src/data/generate-data";
import {
  toGpGridColumns,
  BENCHMARK_COLUMNS,
} from "../../../src/data/column-definitions";
import benchmarkDefaults from "../../../src/config/benchmark-defaults.json";
import type {
  BenchmarkGridApi,
  FilterCondition,
  SortRule,
} from "../../../src/data/types";
import { waitForBrowserIdle } from "../../../src/data/row-processing";

interface GridWrapperProps {
  initialRowCount: number;
  columnCount?: number;
}

function isReady(): boolean {
  return document.querySelectorAll(".gp-grid-row").length > 0;
}

interface CoreReads {
  getScrollRatio(): number;
  getRowCount(): number;
  getRowData(rowIndex: number): BenchmarkRow | undefined;
}

/** Row reads across the published baseline (flat API) and the candidate (namespaces). */
const readCore = (core: unknown): CoreReads | undefined => {
  if (core === null || core === undefined) return undefined;
  const candidate = core as {
    rows?: { getCount(): number; getData(rowIndex: number): BenchmarkRow | undefined };
    viewport: { getScrollRatio(): number };
  };
  if (typeof candidate.rows?.getCount !== "function") return core as CoreReads;
  const { rows, viewport } = candidate;
  return {
    getScrollRatio: () => viewport.getScrollRatio(),
    getRowCount: () => rows.getCount(),
    getRowData: (rowIndex) => rows.getData(rowIndex),
  };
};

export function GridWrapper({ initialRowCount, columnCount = BENCHMARK_COLUMNS.length }: GridWrapperProps) {
  const [data, setData] = useState<BenchmarkRow[]>([]);
  const gridRef = useRef<GridRef<BenchmarkRow> | null>(null);
  const prevDataSourceRef = useRef<DataSource<BenchmarkRow> | null>(null);

  const setupMetricsRef = useRef({ dataGenerationMs: 0, bindStartedAt: 0 });
  const columns = useMemo(() => {
    const baseColumns = toGpGridColumns(BENCHMARK_COLUMNS) as ColumnDefinition[];
    if (columnCount <= baseColumns.length) {
      return baseColumns.slice(0, columnCount);
    }

    return Array.from({ length: columnCount }, (_, index) => {
      const source = baseColumns[index % baseColumns.length];
      if (source === undefined) {
        throw new Error("The benchmark needs at least one base column.");
      }
      return {
        ...source,
        colId: `wide-${index}`,
        headerName: `${source.headerName} ${index}`,
        sortable: false,
        filterable: false,
      };
    });
  }, [columnCount]);

  const dataSource = useMemo(() => {
    return createClientDataSource(data);
  }, [data]);

  // Cleanup old dataSource when it changes (benchmark owns the dataSource lifecycle)
  // Note: Only destroy in effect body, not cleanup, to avoid race conditions with Grid
  useEffect(() => {
    const prevDataSource = prevDataSourceRef.current;
    // Destroy previous dataSource if it changed (not on initial mount)
    if (prevDataSource && prevDataSource !== dataSource) {
      // Small delay to ensure Grid has finished cleanup first
      setTimeout(() => prevDataSource.destroy?.(), 0);
    }
    prevDataSourceRef.current = dataSource;
  }, [dataSource]);

  // Load data function
  const loadData = useCallback((count: number) => {
    const generationStartedAt = performance.now();
    const newData = generateData(count);
    setupMetricsRef.current = {
      dataGenerationMs: performance.now() - generationStartedAt,
      bindStartedAt: performance.now(),
    };
    setData(newData);
  }, []);

  // Clear data function
  const clearData = useCallback(() => {
    setData([]);
  }, []);

  // Sort function using GridCore API - returns Promise for accurate timing
  const sort = useCallback(
    async (field: string, direction: "asc" | "desc"): Promise<void> => {
      const core = gridRef.current?.core;
      if (core) {
        await core.sortFilter.setSort(field, direction);
      }
    },
    [],
  );

  const clearSort = useCallback(async (): Promise<void> => {
    const core = gridRef.current?.core;
    if (core) {
      // Passing null direction clears all sorts when addToExisting is false (default)
      await core.sortFilter.setSort("", null);
    }
  }, []);

  const sortMany = useCallback(async (rules: SortRule[]): Promise<void> => {
    const core = gridRef.current?.core;
    if (!core || rules.length === 0) return;

    const [firstRule, ...remainingRules] = rules;
    await core.sortFilter.setSort(firstRule.field, firstRule.direction);

    for (const rule of remainingRules) {
      await core.sortFilter.setSort(rule.field, rule.direction, true);
    }
  }, []);

  // Filter function using GridCore API - returns Promise for accurate timing
  const filter = useCallback(
    async (field: string, condition: FilterCondition): Promise<void> => {
      const core = gridRef.current?.core;
      if (!core) return;

      // Convert benchmark filter condition to gp-grid ColumnFilterModel format
      let coreCondition: CoreFilterCondition;

      switch (condition.type) {
        case "contains":
          coreCondition = {
            type: "text",
            operator: "contains",
            value: String(condition.value),
          };
          break;
        case "equals":
          coreCondition = {
            type: "text",
            operator: "equals",
            value: String(condition.value),
          };
          break;
        case "greaterThan":
          coreCondition = {
            type: "number",
            operator: ">",
            value: Number(condition.value),
          };
          break;
        case "lessThan":
          coreCondition = {
            type: "number",
            operator: "<",
            value: Number(condition.value),
          };
          break;
        case "between":
          if (Array.isArray(condition.value)) {
            coreCondition = {
              type: "number",
              operator: "between",
              value: condition.value[0],
              valueTo: condition.value[1],
            };
          } else {
            return;
          }
          break;
        default:
          return;
      }

      await core.sortFilter.setFilter(field, {
        conditions: [coreCondition],
        combination: "and",
      });
    },
    [],
  );

  const clearFilters = useCallback(async (): Promise<void> => {
    const core = gridRef.current?.core;
    if (core) {
      // Only active filters need clearing; each call refreshes the data source.
      for (const field of Object.keys(core.sortFilter.getFilterModel())) {
        await core.sortFilter.setFilter(field, null);
      }
    }
  }, []);

  // Expose grid API to window for benchmark control
  useEffect(() => {
    const api: BenchmarkGridApi = {
      loadData,
      clearData,
      sort,
      sortMany,
      clearSort,
      filter,
      clearFilters,
      isReady,
      waitForIdle: waitForBrowserIdle,
      getRowCount: () => data.length,
      // Above ~312k rows gp-grid compresses its DOM scroll space (ratio < 1);
      // the scroll benchmark reads this to recover the true logical travel.
      getScrollRatio: () => readCore(gridRef.current?.core)?.getScrollRatio() ?? 1,
      getDisplayedRowCount: () => readCore(gridRef.current?.core)?.getRowCount() ?? 0,
      getDisplayedRows: (start, count) => {
        const core = readCore(gridRef.current?.core);
        if (!core) return [];

        const rows: BenchmarkRow[] = [];
        for (let rowIndex = start; rowIndex < start + count; rowIndex++) {
          const row = core.getRowData(rowIndex);
          if (row) {
            rows.push(row);
          }
        }

        return rows;
      },
      getSetupMetrics: () => ({
        dataGenerationMs: setupMetricsRef.current.dataGenerationMs,
        bindElapsedMs: Math.max(0, performance.now() - setupMetricsRef.current.bindStartedAt),
        columnCount: columns.length,
      }),
    };

    window.gridApi = api;
  }, [
    loadData,
    clearData,
    sort,
    sortMany,
    clearSort,
    filter,
    clearFilters,
    data.length,
    columns.length,
  ]);

  // Initial data load
  useEffect(() => {
    if (initialRowCount > 0) {
      loadData(initialRowCount);
    }
  }, [initialRowCount, loadData]);

  return (
    <div data-testid="grid-container" style={{ width: "100%", height: "100%" }}>
      <Grid
        gridRef={gridRef}
        columns={columns}
        dataSource={dataSource}
        rowHeight={benchmarkDefaults.rowHeightPx}
        headerHeight={40}
        overscan={benchmarkDefaults.overscanRows}
      />
    </div>
  );
}
