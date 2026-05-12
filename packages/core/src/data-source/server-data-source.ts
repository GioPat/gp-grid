// packages/core/src/data-source/server-data-source.ts

import type {
  DataSource,
  DataSourceLoadMode,
  DataSourceRequest,
  DataSourceResponse,
} from "../types";

// =============================================================================
// Server Data Source
// =============================================================================

export type ServerQueryFunction<TData> = (
  request: DataSourceRequest,
) => Promise<DataSourceResponse<TData>>;

export interface ServerDataSourceOptions {
  /** Server data sources use paginated loading by default. */
  loadMode?: DataSourceLoadMode;
}

/**
 * Creates a server-side data source that delegates all operations to the server.
 * The query function receives sort/filter/range params to pass to the API.
 */
export function createServerDataSource<TData = unknown>(
  queryFn: ServerQueryFunction<TData>,
  options: ServerDataSourceOptions = {},
): DataSource<TData> {
  return {
    loadMode: options.loadMode ?? "paginated",
    async query(
      request: DataSourceRequest,
    ): Promise<DataSourceResponse<TData>> {
      return queryFn(request);
    },
  };
}
