import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type ColumnFiltersState,
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

export function GridWrapper({ initialRowCount }: GridWrapperProps) {
  const [data, setData] = useState<BenchmarkRow[]>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [isReady, setIsReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const columns = useMemo(() => toTanStackColumns(BENCHMARK_COLUMNS), []);
  const totalWidth = useMemo(
    () => getTotalColumnsWidth(BENCHMARK_COLUMNS),
    []
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
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

  // Track when data changes to set ready state
  useEffect(() => {
    if (data.length > 0) {
      const timer = setTimeout(() => setIsReady(true), 100);
      return () => clearTimeout(timer);
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
    setSorting([]);
    setColumnFilters([]);
    setIsReady(false);
  }, []);

  // Sort function - TanStack sorts via React state
  const sort = useCallback(async (field: string, direction: "asc" | "desc"): Promise<void> => {
    setSorting([{ id: field, desc: direction === "desc" }]);
  }, []);

  // Clear sort function
  const clearSort = useCallback(async (): Promise<void> => {
    setSorting([]);
  }, []);

  // Filter function - TanStack filters via React state
  const filter = useCallback(async (field: string, condition: FilterCondition): Promise<void> => {
    setColumnFilters((prev) => {
      const filtered = prev.filter((f) => f.id !== field);
      return [...filtered, { id: field, value: condition.value }];
    });
  }, []);

  // Clear filters function
  const clearFilters = useCallback(async (): Promise<void> => {
    setColumnFilters([]);
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
      getRowCount: () => data.length,
    };

    window.gridApi = api;
  }, [loadData, clearData, sort, clearSort, filter, clearFilters, isReady, data.length]);

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
                  : flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
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
                {row.getVisibleCells().map((cell) => (
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
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
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
