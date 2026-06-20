import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Grid as SmartGrid } from "smart-webcomponents-react/grid";
import "smart-webcomponents-react/source/styles/smart.default.css";
import {
  generateData,
  type BenchmarkRow,
} from "../../../src/data/generate-data";
import {
  BENCHMARK_COLUMNS,
  toSmartGridColumns,
} from "../../../src/data/column-definitions";
import type {
  BenchmarkGridApi,
  FilterCondition,
} from "../../../src/data/types";

interface GridWrapperProps {
  initialRowCount: number;
}

const isReady = (): boolean => {
  return document.querySelectorAll("smart-grid-row").length > 0;
};

const quoteFilterValue = (value: string | number): string => {
  return JSON.stringify(String(value));
};

const toSmartGridFilter = (condition: FilterCondition): string | null => {
  switch (condition.type) {
    case "contains":
      return `CONTAINS ${quoteFilterValue(condition.value as string | number)}`;
    case "equals":
      return `EQUAL ${quoteFilterValue(condition.value as string | number)}`;
    case "greaterThan":
      return `> ${Number(condition.value)}`;
    case "lessThan":
      return `< ${Number(condition.value)}`;
    case "between":
      if (Array.isArray(condition.value)) {
        return `>= ${condition.value[0]} and <= ${condition.value[1]}`;
      }
      return null;
  }
};

export const GridWrapper = ({ initialRowCount }: GridWrapperProps) => {
  const [data, setData] = useState<BenchmarkRow[]>([]);
  const gridRef = useRef<SmartGrid | null>(null);
  const columns = useMemo(() => toSmartGridColumns(BENCHMARK_COLUMNS), []);

  const loadData = useCallback((count: number) => {
    setData(generateData(count));
  }, []);

  const clearData = useCallback(() => {
    setData([]);
  }, []);

  const sort = useCallback(
    async (field: string, direction: "asc" | "desc"): Promise<void> => {
      gridRef.current?.sortBy(field, direction);
    },
    [],
  );

  const clearSort = useCallback(async (): Promise<void> => {
    gridRef.current?.clearSort();
  }, []);

  const filter = useCallback(
    async (field: string, condition: FilterCondition): Promise<void> => {
      const expression = toSmartGridFilter(condition);
      if (expression) {
        gridRef.current?.addFilter(field, expression);
      }
    },
    [],
  );

  const clearFilters = useCallback(async (): Promise<void> => {
    const grid = gridRef.current;
    if (grid) {
      const lastColumn = BENCHMARK_COLUMNS.at(-1);
      for (const column of BENCHMARK_COLUMNS) {
        grid.removeFilter(column.field, column === lastColumn);
      }
    }
  }, []);

  useEffect(() => {
    const api: BenchmarkGridApi = {
      loadData,
      clearData,
      sort,
      clearSort,
      filter,
      clearFilters,
      isReady,
      getRowCount: () => data.length,
      getDisplayedRowCount: () => gridRef.current?.getVisibleRows().length ?? 0,
    };

    window.gridApi = api;
  }, [loadData, clearData, sort, clearSort, filter, clearFilters, data.length]);

  useEffect(() => {
    if (initialRowCount > 0) {
      loadData(initialRowCount);
    }
  }, [initialRowCount, loadData]);

  return (
    <div data-testid="grid-container" style={{ width: "100%", height: "100%" }}>
      <SmartGrid
        ref={gridRef}
        dataSource={data}
        columns={columns}
        layout={{ rowHeight: 32 }}
        sorting={{ enabled: true, mode: "many" }}
        filtering={{ enabled: true }}
        scrolling="virtual"
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
};
