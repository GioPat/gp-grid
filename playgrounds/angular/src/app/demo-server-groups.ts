// playgrounds/angular/src/app/demo-server-groups.ts
// The "Server groups" demo (PRD 009): the playground mock service behind
// 300 ms of latency per request.

import { createServerGroupingSource } from "@gp-grid/angular";
import type {
  RowId,
  ServerGroupingConfig,
  ServerGroupingService,
  ServerGroupingSource,
} from "@gp-grid/angular";
import { createMockGroupingService } from "./server-grouping-mock";

const LATENCY_MS = 300;

const later = <T>(answer: () => Promise<T>): Promise<T> =>
  new Promise<void>((resolve) => setTimeout(resolve, LATENCY_MS)).then(answer);

export const createDemoServerSource = <TData extends { id: RowId }>(
  rows: readonly TData[],
  grouping: Pick<ServerGroupingConfig<TData>, "dimensions" | "measures">,
): ServerGroupingSource<TData> => {
  const mock = createMockGroupingService(rows, { getRowId: (row) => row.id });
  const service: ServerGroupingService<TData> = {
    fetchChildren: (request) => later(() => mock.fetchChildren(request)),
    fetchLeaves: (request) => later(() => mock.fetchLeaves(request)),
  };
  return createServerGroupingSource(service, { ...grouping, grandTotal: "top", getRowId: (row) => row.id });
};
