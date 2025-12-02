// gp-grid-core/src/data-source.ts

import type {
  DataSource,
  DataSourceRequest,
  DataSourceResponse,
  Row,
  SortModel,
  FilterModel,
  CellValue,
} from "./types";

// =============================================================================
// Client Data Source (In-Memory)
// =============================================================================

/**
 * Creates a client-side data source that holds all data in memory.
 * Sorting and filtering are performed client-side.
 */
export function createClientDataSource<TData extends Row = Row>(
  data: TData[],
  options: {
    /** Custom field accessor for nested properties */
    getFieldValue?: (row: TData, field: string) => CellValue;
  } = {}
): DataSource<TData> {
  const { getFieldValue = defaultGetFieldValue } = options;

  return {
    async fetch(request: DataSourceRequest): Promise<DataSourceResponse<TData>> {
      let processedData = [...data];

      // Apply filters
      if (request.filter && Object.keys(request.filter).length > 0) {
        processedData = applyFilters(processedData, request.filter, getFieldValue);
      }

      // Apply sorting
      if (request.sort && request.sort.length > 0) {
        processedData = applySort(processedData, request.sort, getFieldValue);
      }

      const totalRows = processedData.length;

      // Apply pagination
      const { pageIndex, pageSize } = request.pagination;
      const startIndex = pageIndex * pageSize;
      const rows = processedData.slice(startIndex, startIndex + pageSize);

      return { rows, totalRows };
    },
  };
}

// =============================================================================
// Server Data Source
// =============================================================================

export type ServerFetchFunction<TData> = (
  request: DataSourceRequest
) => Promise<DataSourceResponse<TData>>;

/**
 * Creates a server-side data source that delegates all operations to the server.
 * The fetch function receives sort/filter/pagination params to pass to the API.
 */
export function createServerDataSource<TData extends Row = Row>(
  fetchFn: ServerFetchFunction<TData>
): DataSource<TData> {
  return {
    async fetch(request: DataSourceRequest): Promise<DataSourceResponse<TData>> {
      return fetchFn(request);
    },
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function defaultGetFieldValue<TData>(row: TData, field: string): CellValue {
  const parts = field.split(".");
  let value: unknown = row;

  for (const part of parts) {
    if (value == null || typeof value !== "object") {
      return null;
    }
    value = (value as Record<string, unknown>)[part];
  }

  return (value ?? null) as CellValue;
}

function applyFilters<TData>(
  data: TData[],
  filterModel: FilterModel,
  getFieldValue: (row: TData, field: string) => CellValue
): TData[] {
  const filterEntries = Object.entries(filterModel).filter(([, value]) => value !== "");

  if (filterEntries.length === 0) {
    return data;
  }

  return data.filter((row) => {
    for (const [field, filterValue] of filterEntries) {
      const cellValue = getFieldValue(row, field);
      const cellStr = String(cellValue ?? "").toLowerCase();
      const filterStr = filterValue.toLowerCase();

      if (!cellStr.includes(filterStr)) {
        return false;
      }
    }
    return true;
  });
}

function applySort<TData>(
  data: TData[],
  sortModel: SortModel[],
  getFieldValue: (row: TData, field: string) => CellValue
): TData[] {
  return [...data].sort((a, b) => {
    for (const { colId, direction } of sortModel) {
      const aVal = getFieldValue(a, colId);
      const bVal = getFieldValue(b, colId);
      const comparison = compareValues(aVal, bVal);

      if (comparison !== 0) {
        return direction === "asc" ? comparison : -comparison;
      }
    }
    return 0;
  });
}

function compareValues(a: CellValue, b: CellValue): number {
  // Null handling
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  // Numeric comparison
  const aNum = Number(a);
  const bNum = Number(b);
  if (!isNaN(aNum) && !isNaN(bNum)) {
    return aNum - bNum;
  }

  // Date comparison
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }

  // String comparison
  return String(a).localeCompare(String(b));
}

// =============================================================================
// Utility: Create Data Source from Array (Legacy Support)
// =============================================================================

/**
 * Convenience function to create a data source from an array.
 * This provides backwards compatibility with the old `rowData` prop.
 */
export function createDataSourceFromArray<TData extends Row = Row>(
  data: TData[]
): DataSource<TData> {
  return createClientDataSource(data);
}

