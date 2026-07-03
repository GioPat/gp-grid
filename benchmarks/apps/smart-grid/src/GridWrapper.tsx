import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Grid as SmartGrid, Smart } from "smart-webcomponents-react/grid";
import "smart-webcomponents-react/source/styles/smart.default.css";
import {
  generateData,
  type BenchmarkRow,
} from "../../../src/data/generate-data";
import {
  BENCHMARK_COLUMNS,
  toSmartGridColumns,
  toSmartGridDataFields,
} from "../../../src/data/column-definitions";
import type {
  BenchmarkGridApi,
  FilterCondition,
} from "../../../src/data/types";
import {
  processView,
  type FilterState,
  type SortState,
} from "./data-view";
import { waitForBrowserIdle } from "../../../src/data/row-processing";
import type { SortRule } from "../../../src/data/types";

interface GridWrapperProps {
  initialRowCount: number;
}

const isReady = (): boolean => {
  return document.querySelectorAll("smart-grid-row").length > 0;
};

const DATA_FIELDS = toSmartGridDataFields(BENCHMARK_COLUMNS);

// Reconstruct a row from the cells Smart.Grid has actually painted, in column
// order (id, name, age, email, status, salary, department, hireDate, isManager,
// rating). Only `id` is asserted by the benchmark; the remaining fields are
// filled best-effort from the same cells so the value satisfies BenchmarkRow.
// Reading from the DOM (rather than the adapter's cached view) is what makes the
// row-order assertion an independent check of what Smart.Grid rendered.
const parseRowFromCells = (rowEl: Element): BenchmarkRow | null => {
  const cells = Array.from(rowEl.querySelectorAll("smart-grid-cell"));
  if (cells.length === 0) {
    return null;
  }

  const text = (index: number): string => cells[index]?.textContent?.trim() ?? "";
  // Smart.Grid keeps a pool of pre-rendered row elements whose cells are still
  // blank until the virtualDataSource fills them. An empty id cell must be
  // rejected: Number("") is 0 (not NaN), so without this guard those blank rows
  // would surface as phantom id-0 rows and sort to the top of the painted set.
  const idText = text(0);
  const id = Number(idText);
  if (idText === "" || Number.isFinite(id) === false) {
    return null;
  }

  return {
    id,
    name: text(1),
    age: Number(text(2)) || 0,
    email: text(3),
    status: (text(4) || "active") as BenchmarkRow["status"],
    salary: Number(text(5)) || 0,
    department: text(6),
    hireDate: new Date(text(7)),
    isManager: text(8) === "true",
    rating: Number(text(9)) || 0,
  };
};

// Return the rows Smart.Grid has painted, ordered by their on-screen position
// (virtualized rows are not necessarily in DOM order).
const readPaintedRows = (): BenchmarkRow[] => {
  const container = document.querySelector('[data-testid="grid-container"]');
  if (container === null) {
    return [];
  }

  return Array.from(container.querySelectorAll("smart-grid-row"))
    .map((rowEl) => ({
      row: parseRowFromCells(rowEl),
      top: rowEl.getBoundingClientRect().top,
    }))
    .filter(
      (entry): entry is { row: BenchmarkRow; top: number } => entry.row !== null,
    )
    .sort((a, b) => a.top - b.top)
    .map((entry) => entry.row);
};

export const GridWrapper = ({ initialRowCount }: GridWrapperProps) => {
  const [data, setData] = useState<BenchmarkRow[]>([]);
  const gridRef = useRef<SmartGrid | null>(null);
  const columns = useMemo(() => toSmartGridColumns(BENCHMARK_COLUMNS), []);

  // Smart.Grid is fast at 1M rows only when fed on demand via a virtualDataSource
  // (the official virtual-scroll demo does this). Binding a raw array makes it
  // materialize/scan all rows, which is slow. The callback serves
  // just the requested window from a cached sorted/filtered view (see data-view).
  const fullDataRef = useRef<BenchmarkRow[]>([]);
  const displayedLengthRef = useRef(0);
  const sortRef = useRef<SortState>([]);
  const filtersRef = useRef<FilterState>(new Map());
  const processedRef = useRef<BenchmarkRow[] | null>(null);
  // Version handshake: every view-changing operation bumps `requestedViewRef`;
  // the virtualDataSource callback sets `servedViewRef` to the version it fetched
  // for. waitForIdle blocks until they match, so measured time and painted rows
  // reflect a completed re-query rather than the pre-operation view.
  const requestedViewRef = useRef(0);
  const servedViewRef = useRef(0);
  // Bumping this rebuilds the DataAdapter, which is what makes the grid re-fetch
  // the (now re-sorted/re-filtered) virtual data — grid.refresh() only repaints
  // the current window without re-querying the source.
  const [viewVersion, setViewVersion] = useState(0);
  fullDataRef.current = data;

  // Re-fetch the visible window from the grid after the view changed.
  const refreshView = useCallback((): void => {
    processedRef.current = null;
    requestedViewRef.current += 1;
    setViewVersion((version) => version + 1);
  }, []);

  const dataSource = useMemo(() => {
    // New dataset/view invalidates the cache; the callback recomputes on demand.
    processedRef.current = null;
    const buildVersion = requestedViewRef.current;
    if (data.length === 0) {
      displayedLengthRef.current = 0;
      // No fetch happens for an empty grid, so mark this view served now to keep
      // waitForIdle from blocking on a callback that will never fire.
      servedViewRef.current = buildVersion;
      return data;
    }
    return new Smart.DataAdapter({
      virtualDataSource: (
        resultCallback: (result: {
          dataSource: BenchmarkRow[];
          virtualDataSourceLength: number;
        }) => void,
        details: { first?: number; last?: number },
      ) => {
        const processed =
          processedRef.current ??
          processView(fullDataRef.current, filtersRef.current, sortRef.current);
        processedRef.current = processed;
        displayedLengthRef.current = processed.length;
        servedViewRef.current = buildVersion;
        const first = details.first ?? 0;
        const last = details.last ?? processed.length - 1;
        resultCallback({
          dataSource: processed.slice(first, last + 1),
          virtualDataSourceLength: processed.length,
        });
      },
      id: "id",
      dataFields: DATA_FIELDS,
    });
    // viewVersion is a dep so each sort/filter rebuilds the adapter and re-fetches.
  }, [data, viewVersion]);

  const loadData = useCallback((count: number) => {
    sortRef.current = [];
    filtersRef.current = new Map();
    requestedViewRef.current += 1;
    setData(generateData(count));
  }, []);

  const clearData = useCallback(() => {
    sortRef.current = [];
    filtersRef.current = new Map();
    requestedViewRef.current += 1;
    setData([]);
  }, []);

  // Resolve only once Smart.Grid has re-queried the virtualDataSource for the
  // latest requested view, then settle the browser for two frames. The safety
  // valve prevents a hang if the grid never re-fetches for a given operation.
  const waitForIdle = useCallback(async (): Promise<void> => {
    const start = performance.now();
    while (servedViewRef.current < requestedViewRef.current) {
      if (performance.now() - start > 10_000) {
        break;
      }
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    }
    await waitForBrowserIdle();
  }, []);

  const sort = useCallback(
    async (field: string, direction: "asc" | "desc"): Promise<void> => {
      sortRef.current = [{ field, direction }];
      refreshView();
    },
    [refreshView],
  );

  const sortMany = useCallback(
    async (rules: SortRule[]): Promise<void> => {
      sortRef.current = [...rules];
      refreshView();
    },
    [refreshView],
  );

  const clearSort = useCallback(async (): Promise<void> => {
    sortRef.current = [];
    refreshView();
  }, [refreshView]);

  const filter = useCallback(
    async (field: string, condition: FilterCondition): Promise<void> => {
      filtersRef.current.set(field as keyof BenchmarkRow, condition);
      refreshView();
    },
    [refreshView],
  );

  const clearFilters = useCallback(async (): Promise<void> => {
    filtersRef.current = new Map();
    refreshView();
  }, [refreshView]);

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
      waitForIdle,
      getRowCount: () => data.length,
      getDisplayedRowCount: () => displayedLengthRef.current,
      getDisplayedRows: (start, count) => {
        return readPaintedRows().slice(start, start + count);
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
    waitForIdle,
    data.length,
  ]);

  useEffect(() => {
    if (initialRowCount > 0) {
      loadData(initialRowCount);
    }
  }, [initialRowCount, loadData]);

  return (
    <div data-testid="grid-container" style={{ width: "100%", height: "100%" }}>
      <SmartGrid
        ref={gridRef}
        dataSource={dataSource}
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
