import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { AgGridReact } from "ag-grid-react";
import type { GridApi, GridReadyEvent } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import {
  generateData,
  type BenchmarkRow,
} from "../../../src/data/generate-data";
import {
  toAgGridColumns,
  BENCHMARK_COLUMNS,
} from "../../../src/data/column-definitions";
import type { BenchmarkGridApi, FilterCondition } from "../../../src/data/types";

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);

interface GridWrapperProps {
  initialRowCount: number;
}

function isReady(): boolean {
  return document.querySelectorAll(".ag-row").length > 0;
}

export function GridWrapper({ initialRowCount }: GridWrapperProps) {
  const [rowData, setRowData] = useState<BenchmarkRow[]>([]);
  const gridApiRef = useRef<GridApi | null>(null);

  const columns = useMemo(() => toAgGridColumns(BENCHMARK_COLUMNS), []);

  const onGridReady = useCallback((event: GridReadyEvent) => {
    gridApiRef.current = event.api;
  }, []);

  // Load data function
  const loadData = useCallback((count: number) => {
    const newData = generateData(count);
    setRowData(newData);
  }, []);

  // Clear data function
  const clearData = useCallback(() => {
    setRowData([]);
  }, []);

  // Sort function - AG Grid sorts synchronously
  const sort = useCallback(async (field: string, direction: "asc" | "desc"): Promise<void> => {
    if (gridApiRef.current) {
      gridApiRef.current.applyColumnState({
        state: [{ colId: field, sort: direction }],
        defaultState: { sort: null },
      });
    }
  }, []);

  // Clear sort function
  const clearSort = useCallback(async (): Promise<void> => {
    if (gridApiRef.current) {
      gridApiRef.current.applyColumnState({
        defaultState: { sort: null },
      });
    }
  }, []);

  // Filter function - AG Grid filters synchronously
  const filter = useCallback(async (field: string, condition: FilterCondition): Promise<void> => {
    const gridApi = gridApiRef.current;
    if (!gridApi) return;

    let fieldFilter: Record<string, unknown> | undefined;

    switch (condition.type) {
      case "contains":
        fieldFilter = {
          filterType: "text",
          type: "contains",
          filter: condition.value,
        };
        break;
      case "equals":
        fieldFilter = {
          filterType: "text",
          type: "equals",
          filter: condition.value,
        };
        break;
      case "greaterThan":
        fieldFilter = {
          filterType: "number",
          type: "greaterThan",
          filter: condition.value,
        };
        break;
      case "lessThan":
        fieldFilter = {
          filterType: "number",
          type: "lessThan",
          filter: condition.value,
        };
        break;
      case "between":
        if (Array.isArray(condition.value)) {
          fieldFilter = {
            filterType: "number",
            type: "inRange",
            filter: condition.value[0],
            filterTo: condition.value[1],
          };
        }
        break;
    }

    if (fieldFilter) {
      gridApi.setFilterModel({
        ...gridApi.getFilterModel(),
        [field]: fieldFilter,
      });
    }
  }, []);

  // Clear filters function
  const clearFilters = useCallback(async (): Promise<void> => {
    if (gridApiRef.current) {
      gridApiRef.current.setFilterModel(null);
    }
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
      isReady,
      getRowCount: () => rowData.length,
      getDisplayedRowCount: () => gridApiRef.current?.getDisplayedRowCount() ?? 0,
    };

    window.gridApi = api;
  }, [loadData, clearData, sort, clearSort, filter, clearFilters, rowData.length]);

  // Initial data load
  useEffect(() => {
    if (initialRowCount > 0) {
      loadData(initialRowCount);
    }
  }, [initialRowCount, loadData]);

  return (
    <div
      data-testid="grid-container"
      style={{ width: "100%", height: "100%" }}
    >
      <AgGridReact
        rowData={rowData}
        columnDefs={columns}
        rowHeight={32}
        headerHeight={40}
        rowBuffer={20}
        onGridReady={onGridReady}
        suppressColumnVirtualisation={false}
        suppressRowVirtualisation={false}
      />
    </div>
  );
}
