// Shared types for benchmarks

export type GridType = "gp-grid" | "ag-grid" | "tanstack-table" | "handsontable";

export const GRIDS: GridType[] = [
  "gp-grid",
  "ag-grid",
  "tanstack-table",
  "handsontable",
];

export const GRID_PORTS: Record<GridType, number> = {
  "gp-grid": 5100,
  "ag-grid": 5101,
  "tanstack-table": 5102,
  handsontable: 5103,
};

export function getGridPort(grid: GridType): number {
  return GRID_PORTS[grid];
}

// Filter condition for benchmark API
export interface FilterCondition {
  type: "contains" | "equals" | "greaterThan" | "lessThan" | "between";
  value: string | number | [number, number];
}

// Grid API exposed on window for benchmark control
export interface BenchmarkGridApi {
  loadData(count: number): void;
  clearData(): void;
  sort(field: string, direction: "asc" | "desc"): Promise<void>;
  clearSort(): Promise<void>;
  filter(field: string, condition: FilterCondition): Promise<void>;
  clearFilters(): Promise<void>;
  isReady(): boolean;
  getRowCount(): number;
}

// Declare global for TypeScript
declare global {
  interface Window {
    gridApi: BenchmarkGridApi;
  }
}

// Metric types
export interface ScrollMetrics {
  avgFPS: number;
  minFPS: number;
  maxFPS: number;
  frameDropCount: number;
  percentile95FPS: number;
  scrollLatencyMs: number;
  totalFrames: number;
}

export interface RenderMetrics {
  timeToFirstPaint: number;
  timeToFullRender: number;
  domContentLoaded: number;
  largestContentfulPaint: number;
  totalBlockingTime: number;
}

export interface SortFilterMetrics {
  sortAscTime: number;
  sortDescTime: number;
  multiColumnSortTime: number;
  textFilterTime: number;
  numberFilterTime: number;
  complexFilterTime: number;
  clearFilterTime: number;
}

export interface MemoryMetrics {
  initialHeapSizeMB: number;
  afterDataLoadHeapSizeMB: number;
  afterScrollHeapSizeMB: number;
  peakHeapSizeMB: number;
  heapGrowthRateMBPer1KRows: number;
  retainedAfterClearMB: number;
}

export interface BenchmarkResult<T> {
  grid: GridType;
  rowCount: number;
  metrics: T;
  timestamp: string;
}

export interface BenchmarkRun {
  timestamp: string;
  environment: {
    os: string;
    nodeVersion: string;
    chromeVersion: string;
  };
  results: {
    scrollPerformance: BenchmarkResult<ScrollMetrics>[];
    initialRender: BenchmarkResult<RenderMetrics>[];
    sortFilter: BenchmarkResult<SortFilterMetrics>[];
    memoryUsage: BenchmarkResult<MemoryMetrics>[];
  };
}
