import { useEffect, useRef, useCallback, useState } from "react";
import Handsontable from "handsontable";
import "handsontable/dist/handsontable.full.min.css";
import {
  generateData,
  type BenchmarkRow,
} from "../../../src/data/generate-data";
import {
  toHandsontableColumns,
  BENCHMARK_COLUMNS,
} from "../../../src/data/column-definitions";
import type { BenchmarkGridApi, FilterCondition } from "../../../src/data/types";

interface GridWrapperProps {
  initialRowCount: number;
}

export function GridWrapper({ initialRowCount }: GridWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hotRef = useRef<Handsontable | null>(null);
  const [isReady, setIsReady] = useState(false);
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
      rowHeaders: false,
      colHeaders,
      width: "100%",
      height: "100%",
      rowHeights: 32,
      colWidths,
      columnSorting: true,
      filters: true,
      dropdownMenu: false,
      licenseKey: "non-commercial-and-evaluation",
      viewportRowRenderingOffset: 20,
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
    setIsReady(false);

    const data = generateData(count);
    // Convert to array format for Handsontable
    const arrayData = data.map((row) => [
      row.id,
      row.name,
      row.age,
      row.email,
      row.status,
      row.salary,
      row.department,
      row.hireDate,
      row.isManager,
      row.rating,
    ]);

    hotRef.current.loadData(arrayData);
    setRowCount(count);

    // Small delay to ensure rendering is complete
    setTimeout(() => setIsReady(true), 100);
  }, []);

  // Clear data function
  const clearData = useCallback(() => {
    if (!hotRef.current) return;
    hotRef.current.loadData([]);
    setRowCount(0);
    setIsReady(false);
  }, []);

  // Sort function - Handsontable sorts synchronously
  const sort = useCallback(async (field: string, direction: "asc" | "desc"): Promise<void> => {
    if (!hotRef.current) return;

    const colIndex = BENCHMARK_COLUMNS.findIndex((c) => c.field === field);
    if (colIndex === -1) return;

    const columnSorting = hotRef.current.getPlugin("columnSorting");
    columnSorting.sort({
      column: colIndex,
      sortOrder: direction === "asc" ? "asc" : "desc",
    });
  }, []);

  // Clear sort function
  const clearSort = useCallback(async (): Promise<void> => {
    if (!hotRef.current) return;
    const columnSorting = hotRef.current.getPlugin("columnSorting");
    columnSorting.clearSort();
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
      clearSort,
      filter,
      clearFilters,
      isReady: () => isReady,
      getRowCount: () => rowCount,
    };

    window.gridApi = api;
  }, [loadData, clearData, sort, clearSort, filter, clearFilters, isReady, rowCount]);

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
