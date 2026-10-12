// packages/core/src/server-grouping/create-server-grouping-source.ts
// A data source whose every query builds a view over the application's grouping service (PRD 009 D5).

import type {
  DataSource,
  DataSourceRequest,
  DataSourceResponse,
  HierarchicalRowAccess,
  RowCacheOptions,
  RowGroupingState,
  RowId,
  ServerGroupChildrenRequest,
  ServerGroupingService,
  ServerGroupingSpec,
} from "../types";
import { normalizeRowCacheOptions } from "../managers/row-cache-options";
import { createExpansionIds } from "../hierarchy/expansion-state";
import { Branch } from "./branch";
import type { QueryScope } from "./page-apply";
import { checkChildren } from "./protocol";
import { createServerAccess } from "./server-access";

export interface ServerGroupingConfig<TData> {
  dimensions: ServerGroupingSpec["dimensions"];
  /** Sent to the service as is; the grid computes nothing. */
  measures?: ServerGroupingSpec["measures"];
  getRowId: (row: TData) => RowId;
  /** Groups above this depth start expanded; 0, the default, collapses every group. */
  defaultExpandedDepth?: number;
  grandTotal?: "top" | "bottom";
  initialState?: RowGroupingState;
  cache?: RowCacheOptions;
  /** Default: 4. */
  maxConcurrentRequests?: number;
  /** Default: `false`. */
  writable?: boolean;
}

export interface ServerGroupingSource<TData> extends DataSource<TData> {
  readonly loadMode: "all";
  readonly writable: boolean;
  /** The expansion by id, kept across queries. */
  getState(): RowGroupingState;
  /** Releases the current view. */
  destroy(): void;
}

const DEFAULT_CONCURRENCY = 4;

const invalid = (path: string, value: unknown): RangeError =>
  new RangeError(`Invalid serverGrouping.${path}: ${String(value)}`);

const firstRepeat = (values: readonly string[]): string | undefined =>
  values.find((value, index) => values.indexOf(value) !== index);

const validate = <TData>(config: ServerGroupingConfig<TData>): void => {
  if (config.dimensions.length === 0) throw invalid("dimensions", "[]");
  const dimensionId = firstRepeat(config.dimensions.map((dimension) => dimension.id ?? dimension.field));
  if (dimensionId !== undefined) throw invalid("dimensions.id", dimensionId);
  const measureField = firstRepeat((config.measures ?? []).map((measure) => measure.field));
  if (measureField !== undefined) throw invalid("measures.field", measureField);
  const depth = config.defaultExpandedDepth ?? 0;
  if (Number.isNaN(depth) || depth < 0) throw invalid("defaultExpandedDepth", depth);
  if (typeof config.getRowId !== "function") throw invalid("getRowId", config.getRowId);
  const concurrency = config.maxConcurrentRequests ?? DEFAULT_CONCURRENCY;
  if (Number.isNaN(concurrency) || concurrency <= 0) throw invalid("maxConcurrentRequests", concurrency);
};

const scopeOf = (request: DataSourceRequest): QueryScope => ({
  ...(request.sort !== undefined && { sort: request.sort }),
  ...(request.filter !== undefined && { filter: request.filter }),
});

export const createServerGroupingSource = <TData>(
  service: ServerGroupingService<TData>,
  config: ServerGroupingConfig<TData>,
): ServerGroupingSource<TData> => {
  validate(config);
  const grouping: ServerGroupingSpec = {
    dimensions: config.dimensions.map((dimension) => ({ ...dimension })),
    measures: (config.measures ?? []).map((measure) => ({ ...measure })),
  };
  const cache = normalizeRowCacheOptions(config.cache);
  const maxConcurrentRequests = Math.max(Math.floor(config.maxConcurrentRequests ?? DEFAULT_CONCURRENCY), 1);
  const state = createExpansionIds(config.defaultExpandedDepth ?? 0, config.initialState);
  let current: HierarchicalRowAccess<TData> | null = null;
  let rootRequest: AbortController | null = null;
  /** Moves with every query and `destroy()`, so a superseded root response builds nothing. */
  let generation = 0;

  const releaseCurrent = () => {
    generation += 1;
    rootRequest?.abort();
    rootRequest = null;
    current?.release?.();
    current = null;
  };

  const query = async (request: DataSourceRequest): Promise<DataSourceResponse<TData>> => {
    releaseCurrent();
    const token = generation;
    const controller = new AbortController();
    rootRequest = controller;
    const scope = scopeOf(request);
    const children: ServerGroupChildrenRequest = {
      revision: null,
      grouping,
      path: [],
      range: { startRow: 0, endRow: cache.pageSize },
      ...scope,
      signal: controller.signal,
    };
    const response = await service.fetchChildren(children);
    if (token !== generation) throw new Error("Superseded by a later query");
    rootRequest = null;
    const error = checkChildren(children, response, null);
    if (error !== null) throw new Error(error);
    const access = createServerAccess<TData>({
      service,
      grouping,
      scope,
      revision: response.revision,
      root: new Branch<TData>([], response.totalCount, cache.pageSize),
      rootChildren: response.children,
      totals: response.totals ?? {},
      grandTotal: config.grandTotal,
      getRowId: config.getRowId,
      state,
      cache,
      maxConcurrentRequests,
    });
    current = access;
    return { rows: [], totalRows: access.rowCount, access };
  };

  return {
    loadMode: "all",
    writable: config.writable ?? false,
    query,
    getState: () => state.snapshot(),
    destroy: releaseCurrent,
  };
};
