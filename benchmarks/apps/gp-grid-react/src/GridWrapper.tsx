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
}

function isReady(): boolean {
  return document.querySelectorAll(".gp-grid-row").length > 0;
}

export function GridWrapper({ initialRowCount }: GridWrapperProps) {
  const [data, setData] = useState<BenchmarkRow[]>([]);
  const gridRef = useRef<GridRef<BenchmarkRow> | null>(null);
  const prevDataSourceRef = useRef<DataSource<BenchmarkRow> | null>(null);

  const columns = useMemo(() => toGpGridColumns(BENCHMARK_COLUMNS) as ColumnDefinition[], []);

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
    const newData = generateData(count);
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
        await core.setSort(field, direction);
      }
    },
    [],
  );

  const clearSort = useCallback(async (): Promise<void> => {
    const core = gridRef.current?.core;
    if (core) {
      // Passing null direction clears all sorts when addToExisting is false (default)
      await core.setSort("", null);
    }
  }, []);

  const sortMany = useCallback(async (rules: SortRule[]): Promise<void> => {
    const core = gridRef.current?.core;
    if (!core || rules.length === 0) return;

    const [firstRule, ...remainingRules] = rules;
    await core.setSort(firstRule.field, firstRule.direction);

    for (const rule of remainingRules) {
      await core.setSort(rule.field, rule.direction, true);
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

      await core.setFilter(field, {
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
      for (const field of Object.keys(core.getFilterModel())) {
        await core.setFilter(field, null);
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
      getScrollRatio: () => gridRef.current?.core?.getScrollRatio() ?? 1,
      getDisplayedRowCount: () => gridRef.current?.core?.getRowCount() ?? 0,
      getDisplayedRows: (start, count) => {
        const core = gridRef.current?.core;
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
