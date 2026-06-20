import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  useTable,
  tableFeatures,
  columnFilteringFeature,
  rowSortingFeature,
  columnSizingFeature,
  createFilteredRowModel,
  createSortedRowModel,
  type FilterFn,
  type TableFeatures,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  generateData,
  type BenchmarkRow,
} from "../../../src/data/generate-data";
import {
  toTanStackColumns,
  BENCHMARK_COLUMNS,
  getTotalColumnsWidth,
} from "../../../src/data/column-definitions";
import type { BenchmarkGridApi, FilterCondition } from "../../../src/data/types";

interface GridWrapperProps {
  initialRowCount: number;
}

const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 40;

const benchmarkFilter: FilterFn<TableFeatures, BenchmarkRow> = (
  row,
  columnId,
  condition: FilterCondition,
): boolean => {
  const value = row.getValue(columnId);

  switch (condition.type) {
    case "contains":
      return String(value).toLowerCase().includes(String(condition.value).toLowerCase());
    case "equals":
      return String(value).toLowerCase() === String(condition.value).toLowerCase();
    case "greaterThan":
      return Number(value) > Number(condition.value);
    case "lessThan":
      return Number(value) < Number(condition.value);
    case "between":
      if (Array.isArray(condition.value)) {
        return Number(value) >= condition.value[0]
          && Number(value) <= condition.value[1];
      }
      return false;
  }
};

const features = tableFeatures({
  columnFilteringFeature,
  rowSortingFeature,
  columnSizingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
});

function isReady(): boolean {
  return document.querySelectorAll('[data-row-index]').length > 0;
}

export function GridWrapper({ initialRowCount }: GridWrapperProps) {
  const [data, setData] = useState<BenchmarkRow[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const columns = useMemo(
    () => toTanStackColumns(BENCHMARK_COLUMNS).map((column) => ({
      ...column,
      filterFn: benchmarkFilter,
    })),
    [],
  );
  const totalWidth = useMemo(
    () => getTotalColumnsWidth(BENCHMARK_COLUMNS),
    []
  );

  const table = useTable({
    features,
    data,
    columns,
  });

  const { rows } = table.getRowModel();

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // Load data function
  const loadData = useCallback((count: number) => {
    const newData = generateData(count);
    setData(newData);
  }, []);

  // Clear data function
  const clearData = useCallback(() => {
    setData([]);
    table.setSorting([]);
    table.setColumnFilters([]);
  }, [table]);

  // Sort function - TanStack sorts synchronously
  const sort = useCallback(async (field: string, direction: "asc" | "desc"): Promise<void> => {
    table.setSorting([{ id: field, desc: direction === "desc" }]);
  }, [table]);

  // Clear sort function
  const clearSort = useCallback(async (): Promise<void> => {
    table.setSorting([]);
  }, [table]);

  // Pass the complete condition so TanStack applies the same predicate as the other grids.
  const filter = useCallback(async (field: string, condition: FilterCondition): Promise<void> => {
    const column = table.getColumn(field);
    if (!column) return;
    column.setFilterValue(condition);
  }, [table]);

  // Clear filters function
  const clearFilters = useCallback(async (): Promise<void> => {
    table.setColumnFilters([]);
  }, [table]);

  // Expose grid API to window for benchmark control
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
      getDisplayedRowCount: () => table.getRowModel().rows.length,
    };

    window.gridApi = api;
  }, [loadData, clearData, sort, clearSort, filter, clearFilters, data.length, table]);

  // Initial data load
  useEffect(() => {
    if (initialRowCount > 0) {
      loadData(initialRowCount);
    }
  }, [initialRowCount, loadData]);

  return (
    <div
      data-testid="grid-container"
      ref={containerRef}
      data-viewport
      style={{
        width: "100%",
        height: "100%",
        overflow: "auto",
      }}
    >
      <div style={{ width: totalWidth, minWidth: "100%" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            height: HEADER_HEIGHT,
            borderBottom: "1px solid #e5e7eb",
            backgroundColor: "#f9fafb",
            position: "sticky",
            top: 0,
            zIndex: 1,
          }}
        >
          {table.getHeaderGroups().map((headerGroup) =>
            headerGroup.headers.map((header) => (
              <div
                key={header.id}
                style={{
                  width: header.getSize(),
                  flexShrink: 0,
                  padding: "8px 12px",
                  fontWeight: 600,
                  borderRight: "1px solid #e5e7eb",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {header.isPlaceholder
                  ? null
                  : <table.FlexRender header={header} />}
              </div>
            ))
          )}
        </div>

        {/* Virtual rows container */}
        <div
          style={{
            height: totalSize,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index];
            return (
              <div
                key={row.id}
                data-row-index={virtualRow.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: ROW_HEIGHT,
                  transform: `translateY(${virtualRow.start}px)`,
                  display: "flex",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                {row.getAllCells().map((cell) => (
                  <div
                    key={cell.id}
                    style={{
                      width: cell.column.getSize(),
                      flexShrink: 0,
                      padding: "4px 12px",
                      borderRight: "1px solid #e5e7eb",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <table.FlexRender cell={cell} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
