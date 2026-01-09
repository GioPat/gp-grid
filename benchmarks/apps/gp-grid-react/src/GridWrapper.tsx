import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Grid, createClientDataSource } from "gp-grid-react";
import type { GridRef, FilterCondition as CoreFilterCondition, ColumnDefinition } from "gp-grid-react";
import {
  generateData,
  type BenchmarkRow,
} from "../../../src/data/generate-data";
import {
  toGpGridColumns,
  BENCHMARK_COLUMNS,
} from "../../../src/data/column-definitions";
import type {
  BenchmarkGridApi,
  FilterCondition,
} from "../../../src/data/types";

interface GridWrapperProps {
  initialRowCount: number;
}

export function GridWrapper({ initialRowCount }: GridWrapperProps) {
  const [data, setData] = useState<BenchmarkRow[]>([]);
  const [isReady, setIsReady] = useState(false);
  const gridRef = useRef<GridRef<BenchmarkRow> | null>(null);

  const columns = useMemo(() => toGpGridColumns(BENCHMARK_COLUMNS) as ColumnDefinition[], []);

  const dataSource = useMemo(() => {
    return createClientDataSource(data);
  }, [data]);

  // Track when data source changes to set ready state
  useEffect(() => {
    if (data.length > 0) {
      // Wait for grid to render rows
      const checkReady = () => {
        const rows = document.querySelectorAll(".gp-grid-row");
        if (rows.length > 0) {
          setIsReady(true);
        } else {
          requestAnimationFrame(checkReady);
        }
      };
      requestAnimationFrame(checkReady);
    } else {
      setIsReady(false);
    }
  }, [data]);

  // Load data function
  const loadData = useCallback((count: number) => {
    setIsReady(false);
    const newData = generateData(count);
    setData(newData);
  }, []);

  // Clear data function
  const clearData = useCallback(() => {
    setData([]);
    setIsReady(false);
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
      // Clear filter for each column sequentially
      for (const col of columns) {
        await core.setFilter(col.field, null);
      }
    }
  }, [columns]);

  // Expose grid API to window for benchmark control
  useEffect(() => {
    const api: BenchmarkGridApi = {
      loadData,
      clearData,
      sort,
      clearSort,
      filter,
      clearFilters,
      isReady: () => isReady,
      getRowCount: () => data.length,
    };

    window.gridApi = api;
  }, [
    loadData,
    clearData,
    sort,
    clearSort,
    filter,
    clearFilters,
    isReady,
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
        rowHeight={32}
        headerHeight={40}
      />
    </div>
  );
}
