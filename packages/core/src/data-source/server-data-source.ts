// packages/core/src/data-source/server-data-source.ts

import type {
  DataSource,
  DataSourceRequest,
  DataSourceResponse,
  Row,
} from "../types";

// =============================================================================
// Server Data Source
// =============================================================================

export type ServerFetchFunction<TData> = (
  request: DataSourceRequest,
) => Promise<DataSourceResponse<TData>>;

/**
 * Creates a server-side data source that delegates all operations to the server.
 * The fetch function receives sort/filter/pagination params to pass to the API.
 */
export function createServerDataSource<TData extends Row = Row>(
  fetchFn: ServerFetchFunction<TData>,
): DataSource<TData> {
  return {
    async fetch(
      request: DataSourceRequest,
    ): Promise<DataSourceResponse<TData>> {
      return fetchFn(request);
    },
  };
}
