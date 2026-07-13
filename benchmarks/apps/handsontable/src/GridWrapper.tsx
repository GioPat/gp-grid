import { useEffect, useRef, useCallback, useState } from "react";
import Handsontable from "handsontable";
// Handsontable 15+ ships its stylesheet as a base file plus a separate theme;
// the old single `dist/handsontable.full.min.css` bundle is no longer exported.
// The grid renders unstyled (collapsed rows) without an applied theme, so the
// base CSS, the theme CSS, and the matching `themeName` option must agree.
import "handsontable/styles/handsontable.min.css";
import "handsontable/styles/ht-theme-main.min.css";
import {
  generateData,
  type BenchmarkRow,
} from "../../../src/data/generate-data";
import {
  toHandsontableColumns,
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
  return document.querySelectorAll(".htCore tbody tr").length > 0;
}

const rowFromValues = (values: unknown[]): BenchmarkRow | null => {
  if (values.length < BENCHMARK_COLUMNS.length) {
    return null;
  }

  return {
    id: Number(values[0]),
    name: String(values[1]),
    age: Number(values[2]),
    email: String(values[3]),
    status: values[4] as BenchmarkRow["status"],
    salary: Number(values[5]),
    department: String(values[6]),
    hireDate: values[7] instanceof Date ? values[7] : new Date(String(values[7])),
    isManager: Boolean(values[8]),
    rating: Number(values[9]),
  };
};

export function GridWrapper({ initialRowCount }: GridWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hotRef = useRef<Handsontable | null>(null);
  const [rowCount, setRowCount] = useState(0);

  // Initialize Handsontable
  useEffect(() => {
    if (!containerRef.current) return;

    const columns = toHandsontableColumns(BENCHMARK_COLUMNS);
    const colHeaders = BENCHMARK_COLUMNS.map((c) => c.headerName);
    const colWidths = BENCHMARK_COLUMNS.map((c) => c.width);

    const hot = new Handsontable(containerRef.current, {
      data: [],
      columns,
      themeName: "ht-theme-main",
      rowHeaders: false,
      colHeaders,
      width: "100%",
      height: "100%",
      rowHeights: 32,
      colWidths,
      // multiColumnSorting (not columnSorting) so multi-column sort is honored;
      // the two plugins conflict, and the single-column plugin silently
      // truncates a multi-rule sort to its first rule. This plugin also handles
      // single-column sorts, so it covers every sort case in the benchmark.
      multiColumnSorting: true,
      filters: true,
      dropdownMenu: false,
      licenseKey: "non-commercial-and-evaluation",
      viewportRowRenderingOffset: benchmarkDefaults.overscanRows,
      viewportColumnRenderingOffset: 10,
    });

    hotRef.current = hot;

    return () => {
      hot.destroy();
      hotRef.current = null;
    };
  }, []);

  // Load data function
  const loadData = useCallback((count: number) => {
    if (!hotRef.current) return;

    const data = generateData(count);
    hotRef.current.loadData(data);
    setRowCount(count);
  }, []);

  // Clear data function
  const clearData = useCallback(() => {
    if (!hotRef.current) return;
    hotRef.current.loadData([]);
    setRowCount(0);
  }, []);

  // Sort function - Handsontable sorts synchronously
  const sort = useCallback(async (field: string, direction: "asc" | "desc"): Promise<void> => {
    if (!hotRef.current) return;

    const colIndex = BENCHMARK_COLUMNS.findIndex((c) => c.field === field);
    if (colIndex === -1) return;

    const columnSorting = hotRef.current.getPlugin("multiColumnSorting");
    columnSorting.sort({
      column: colIndex,
      sortOrder: direction === "asc" ? "asc" : "desc",
    });
  }, []);

  // Clear sort function
  const clearSort = useCallback(async (): Promise<void> => {
    if (!hotRef.current) return;
    const columnSorting = hotRef.current.getPlugin("multiColumnSorting");
    columnSorting.clearSort();
  }, []);

  const sortMany = useCallback(async (rules: SortRule[]): Promise<void> => {
    if (!hotRef.current) return;

    const columnSorting = hotRef.current.getPlugin("multiColumnSorting");
    columnSorting.sort(
      rules
        .map((rule) => {
          const column = BENCHMARK_COLUMNS.findIndex((c) => c.field === rule.field);
          return column >= 0
            ? {
                column,
                sortOrder: rule.direction,
              }
            : null;
        })
        .filter((config): config is { column: number; sortOrder: "asc" | "desc" } => {
          return config !== null;
        }),
    );
  }, []);

  // Filter function - Handsontable filters synchronously
  const filter = useCallback(async (field: string, condition: FilterCondition): Promise<void> => {
    if (!hotRef.current) return;

    const colIndex = BENCHMARK_COLUMNS.findIndex((c) => c.field === field);
    if (colIndex === -1) return;

    const filtersPlugin = hotRef.current.getPlugin("filters");

    // Clear existing conditions for this column
    filtersPlugin.clearConditions(colIndex);

    // Add new condition
    switch (condition.type) {
      case "contains":
        filtersPlugin.addCondition(colIndex, "contains", [condition.value]);
        break;
      case "equals":
        filtersPlugin.addCondition(colIndex, "eq", [condition.value]);
        break;
      case "greaterThan":
        filtersPlugin.addCondition(colIndex, "gt", [condition.value]);
        break;
      case "lessThan":
        filtersPlugin.addCondition(colIndex, "lt", [condition.value]);
        break;
      case "between":
        if (Array.isArray(condition.value)) {
          filtersPlugin.addCondition(colIndex, "between", [
            condition.value[0],
            condition.value[1],
          ]);
        }
        break;
    }

    filtersPlugin.filter();
  }, []);

  // Clear filters function
  const clearFilters = useCallback(async (): Promise<void> => {
    if (!hotRef.current) return;
    const filtersPlugin = hotRef.current.getPlugin("filters");
    filtersPlugin.clearConditions();
    filtersPlugin.filter();
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
      getRowCount: () => rowCount,
      getDisplayedRowCount: () => hotRef.current?.countRows() ?? 0,
      getDisplayedRows: (start, count) => {
        const hot = hotRef.current;
        if (!hot) return [];

        const rows: BenchmarkRow[] = [];
        for (let rowIndex = start; rowIndex < start + count; rowIndex++) {
          const row = rowFromValues(hot.getDataAtRow(rowIndex));
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
    rowCount,
  ]);

  // Initial data load
  useEffect(() => {
    if (initialRowCount > 0 && hotRef.current) {
      // Small delay to ensure HOT is fully initialized
      const timer = setTimeout(() => loadData(initialRowCount), 50);
      return () => clearTimeout(timer);
    }
  }, [initialRowCount, loadData]);

  return (
    <div
      data-testid="grid-container"
      ref={containerRef}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
