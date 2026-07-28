// Shared types for benchmarks

import type { BenchmarkRow } from "./generate-data";

export type GridType =
  | "gp-grid"
  | "ag-grid"
  | "tanstack-table"
  | "handsontable"
  | "smart-grid";

export const GRIDS: GridType[] = [
  "gp-grid",
  "ag-grid",
  "tanstack-table",
  "handsontable",
  "smart-grid",
];

export const GRID_PORTS: Record<GridType, number> = {
  "gp-grid": 5100,
  "ag-grid": 5101,
  "tanstack-table": 5102,
  handsontable: 5103,
  "smart-grid": 5104,
};

export function getGridPort(grid: GridType): number {
  return GRID_PORTS[grid];
}

export type GridImplementationMode =
  | "native-grid"
  | "headless-table-virtualizer"
  | "app-side-virtual-data";

export interface GridMetadata {
  displayName: string;
  websiteUrl: string;
  implementationMode: GridImplementationMode;
  comment: string | null;
}

export const GRID_METADATA: Record<GridType, GridMetadata> = {
  "gp-grid": {
    displayName: "gp-grid",
    websiteUrl: "https://www.gp-grid.io",
    implementationMode: "native-grid",
    comment:
      "Above ~312,000 rows gp-grid caps its DOM scroll container at 10,000,000px, compresses the scroll space, and dampens wheel deltas before applying them, so the shared wheel input traverses fewer rows than on the natively-scrolling grids (see Rows Traversed). Below that threshold it scrolls natively via the wheel like the other grids. Its scroll delta is reported in logical (content) pixels.",
  },
  "ag-grid": {
    displayName: "AG Grid",
    websiteUrl: "https://www.ag-grid.com/react-data-grid/",
    implementationMode: "native-grid",
    comment: null,
  },
  "tanstack-table": {
    displayName: "TanStack Table",
    websiteUrl: "https://tanstack.com/table/latest",
    implementationMode: "headless-table-virtualizer",
    comment:
      "TanStack Table is headless: it supplies the sort/filter/row models and, with @tanstack/react-virtual, the row virtualization, but the row and cell DOM is authored by this benchmark. Its render and scroll numbers therefore reflect the benchmark's own markup, not a shipped grid component.",
  },
  handsontable: {
    displayName: "Handsontable",
    websiteUrl: "https://handsontable.com/",
    implementationMode: "native-grid",
    comment: null,
  },
  "smart-grid": {
    displayName: "Smart.Grid",
    websiteUrl: "https://www.htmlelements.com/react/demos/grid/overview/",
    implementationMode: "app-side-virtual-data",
    comment:
      "Uses Smart.Grid virtualDataSource; sort/filter processing is performed by the benchmark adapter over the full in-memory dataset, then Smart.Grid renders the requested virtual window. Smart.Grid exposes no configurable row overscan, so the shared overscan setting does not apply to it. Its custom scrollbar rescales mouse-wheel input to fixed line steps rather than the event's delta, so under the shared wheel input it traverses a different number of rows than the natively-scrolling grids (see Rows Traversed). After the dataset is cleared, Smart.Grid keeps the previously served rows referenced internally — clearRows(), an emptied dataSource, and refresh() do not release them — so its Retained memory reflects the library holding the old dataset until the grid instance is destroyed.",
  },
};

// Filter condition for benchmark API
export interface FilterCondition {
  type: "contains" | "equals" | "greaterThan" | "lessThan" | "between";
  value: string | number | [number, number];
}

export interface SortRule {
  field: string;
  direction: "asc" | "desc";
}

// Grid API exposed on window for benchmark control
export interface BenchmarkGridApi {
  loadData(count: number): void;
  clearData(): void;
  sort(field: string, direction: "asc" | "desc"): Promise<void>;
  sortMany(rules: SortRule[]): Promise<void>;
  clearSort(): Promise<void>;
  filter(field: string, condition: FilterCondition): Promise<void>;
  clearFilters(): Promise<void>;
  isReady(): boolean;
  waitForIdle(): Promise<void>;
  getRowCount(): number;
  getDisplayedRowCount(): number;
  getDisplayedRows(start: number, count: number): BenchmarkRow[];
  // Optional: the grid's active scroll compression ratio (1 = none, < 1 = the
  // DOM scroll space is compressed and the scrollbar maps to a larger logical
  // range). The scroll benchmark uses this to measure gp-grid's true (logical)
  // scroll travel once compression engages above ~312k rows.
  getScrollRatio?(): number;
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
  // "5% low" FPS: frame rate over the slowest 5% of frames. Never above avgFPS.
  low5FPS: number;
  p95FrameTimeMs: number;
  scrollDurationMs: number;
  actualScrollDeltaPx: number;
  scrollPxPerSecond: number;
  // How many rows the measured wheel pass actually covered (logical scroll
  // delta / shared row height). All grids receive the identical wheel input;
  // this reports how far each grid's scroll model translated it.
  rowsTraversed: number;
  totalFrames: number;
}

export interface RenderMetrics {
  timeToFirstPaint: number;
  timeToFullRender: number;
  domContentLoaded: number;
  // null when the browser never reported an LCP candidate for the page.
  largestContentfulPaint: number | null;
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

export interface MetricStat {
  min: number;
  max: number;
  median: number;
  mean: number;
}

export type MetricStats = Record<string, MetricStat>;

export interface RunEnvironment {
  os: string;
  nodeVersion: string;
  chromeVersion: string;
  cpuModel: string;
  logicalCpuCount: number;
  totalMemoryMB: number;
}

export interface RunConfig {
  rowCounts: number[];
  iterations: number;
  rowHeightPx: number;
  playwrightWorkers: number;
  retries: number;
  overscanRows: number;
  viewport: {
    width: number;
    height: number;
  };
  headless: boolean;
}

// Exact resolved versions of the libraries under test, so a published run is
// reproducible. `packages` maps each installed npm package name to its version.
export interface GridLibraryVersion {
  packages: Record<string, string>;
}

export interface GridPackageSize {
  packages: string[];
  // Exact version each package was sized at, read from the installed manifest.
  versions: Record<string, string>;
  minifiedBytes: number;
  gzipBytes: number;
}

export interface RunManifest {
  runId: string;
  timestamp: string;
  environment: RunEnvironment;
  config: RunConfig;
  libraryVersions: Record<GridType, GridLibraryVersion>;
  // Optional so result readers remain compatible with runs created before
  // package-size measurement was added.
  packageSizes?: Record<GridType, GridPackageSize>;
}

export interface BenchmarkResult<T> {
  runId: string;
  grid: GridType;
  displayName: string;
  websiteUrl: string;
  implementationMode: GridImplementationMode;
  comment: string | null;
  rowCount: number;
  metrics: T;
  samples: T[];
  stats: MetricStats;
  iterations: number;
  timestamp: string;
}

export interface BenchmarkRun {
  runId: string;
  timestamp: string;
  environment: RunEnvironment;
  config: RunConfig;
  libraryVersions: Record<GridType, GridLibraryVersion>;
  packageSizes?: Record<GridType, GridPackageSize>;
  results: {
    scrollPerformance: BenchmarkResult<ScrollMetrics>[];
    initialRender: BenchmarkResult<RenderMetrics>[];
    sortFilter: BenchmarkResult<SortFilterMetrics>[];
    memoryUsage: BenchmarkResult<MemoryMetrics>[];
  };
}
