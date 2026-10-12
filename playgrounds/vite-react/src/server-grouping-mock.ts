// An in-memory ServerGroupingService with controls that hold, fail and corrupt its responses.
// This file and `mock-grouping-fold.ts` import no test runner: the playgrounds copy them with
// only the import paths changed.

import type {
  DataSourceRange,
  GroupPathStep,
  RowId,
  ServerGroupChildrenRequest,
  ServerGroupChildrenResponse,
  ServerGroupingService,
  ServerGroupingSpec,
  ServerGroupNode,
  ServerLeavesRequest,
  ServerLeavesResponse,
  SortModel,
} from "@gp-grid/react";
import {
  assertMeasures,
  countKeys,
  criterionOf,
  foldMeasures,
  groupRecords,
  matchesPath,
  nodeKeyOf,
  passesFilter,
  sortRecords,
  type Bucket,
  type PathCriterion,
} from "./mock-grouping-fold";

export type MockRequestKind = "children" | "leaves";

export type MockCorruption =
  | "stale-revision"
  | "wrong-count"
  | "long-page"
  | "short-page"
  | "object-key";

export interface MockGroupingOptions<TData> {
  getRowId: (row: TData) => RowId;
  /** Echoed by every response until `bumpRevision`; 1 by default. */
  revision?: number;
}

/** `aborted` is the request signal's state when its response settled, `false` until then. */
export type MockRequestEntry =
  | { kind: "children"; request: ServerGroupChildrenRequest; aborted: boolean }
  | { kind: "leaves"; request: ServerLeavesRequest; aborted: boolean };

export interface MockGroupingService<TData> extends ServerGroupingService<TData> {
  readonly revision: number;
  /** Every request in arrival order. */
  readonly requests: MockRequestEntry[];
  /** Queues every later response until `release`, which builds it with the state of that moment. */
  hold(): void;
  /** Settles the first `count` queued responses in arrival order, all of them when omitted. */
  release(count?: number): void;
  /** Rejects the next request of `kind` with `Error("mock failure")`. */
  failNext(kind: MockRequestKind): void;
  /** Answers the next request of `kind` with a protocol error. */
  corruptNext(kind: "children", how: MockCorruption): void;
  corruptNext(kind: "leaves", how: Exclude<MockCorruption, "object-key">): void;
  /** Moves the revision every later response echoes; returns it. */
  bumpRevision(): number;
}

type Fault = "fail" | MockCorruption;

const EXTRA_BUCKET: Bucket<never> = { tag: "s", key: "mock-extra", records: [] };

const dimensionIdOf = (dimension: ServerGroupingSpec["dimensions"][number]): string =>
  dimension.id ?? dimension.field;

/** The criteria of `path`, which may name at most `maxDepth` of the grouping's dimensions. */
const criteriaOf = (
  grouping: ServerGroupingSpec,
  path: readonly GroupPathStep[],
  maxDepth: number,
): PathCriterion[] => {
  if (path.length > maxDepth) {
    throw new RangeError(`Mock grouping: a path of ${path.length} steps is too deep`);
  }
  return path.map((step, level) => {
    const dimension = grouping.dimensions[level];
    if (dimension === undefined || dimensionIdOf(dimension) !== step[0]) {
      throw new RangeError(`Mock grouping: unexpected dimension "${step[0]}" at level ${level}`);
    }
    return criterionOf(dimension.field, step);
  });
};

const isDescending = (sort: readonly SortModel[] | undefined, field: string): boolean =>
  sort?.some((entry) => entry.colId === field && entry.direction === "desc") ?? false;

/** `range` clipped to `items`; a long page adds the next item, or repeats the last, or `filler`. */
const pageOf = <T>(
  items: readonly T[],
  range: DataSourceRange,
  how: Fault | undefined,
  filler: T | undefined,
): T[] => {
  const page = items.slice(range.startRow, range.endRow);
  if (how === "short-page") return page.slice(0, -1);
  if (how === "long-page") {
    const extra = items[range.startRow + page.length] ?? items.at(-1) ?? filler;
    return extra === undefined ? page : [...page, extra];
  }
  return page;
};

const nodeOf = <TData>(
  bucket: Bucket<TData>,
  grouping: ServerGroupingSpec,
  level: number,
): ServerGroupNode => {
  const below = grouping.dimensions[level + 1];
  return {
    key: nodeKeyOf(bucket.tag, bucket.key),
    childCount: below === undefined ? bucket.records.length : countKeys(bucket.records, below.field),
    leafCount: bucket.records.length,
    aggregates: foldMeasures(bucket.records, grouping.measures),
  };
};

const withObjectKey = (children: ServerGroupNode[]): ServerGroupNode[] =>
  children.map((node, index) => (index === 0 ? { ...node, key: { mock: "object-key" } } : node));

const assertUniqueIds = <TData>(rows: readonly TData[], getRowId: (row: TData) => RowId): void => {
  const ids = new Set<RowId>();
  for (const row of rows) {
    const id = getRowId(row);
    if (ids.has(id)) throw new RangeError(`Mock grouping: duplicate row id ${String(id)}`);
    ids.add(id);
  }
};

export const createMockGroupingService = <TData>(
  rows: readonly TData[],
  options: MockGroupingOptions<TData>,
): MockGroupingService<TData> => {
  assertUniqueIds(rows, options.getRowId);
  let revision = options.revision ?? 1;
  let holding = false;
  const queue: (() => void)[] = [];
  const requests: MockRequestEntry[] = [];
  const faults: Record<MockRequestKind, Fault[]> = { children: [], leaves: [] };

  const revisionFor = (how: Fault | undefined) => (how === "stale-revision" ? revision - 1 : revision);
  const countFor = (count: number, how: Fault | undefined) => (how === "wrong-count" ? count + 1 : count);

  const matching = (
    request: ServerGroupChildrenRequest | ServerLeavesRequest,
    criteria: readonly PathCriterion[],
  ): TData[] =>
    rows.filter((row) => passesFilter(row, request.filter) && matchesPath(row, criteria));

  const childrenOf = (
    request: ServerGroupChildrenRequest,
    how: Fault | undefined,
  ): ServerGroupChildrenResponse => {
    const { grouping, path } = request;
    const dimensions = grouping.dimensions;
    const criteria = criteriaOf(grouping, path, dimensions.length - 1);
    assertMeasures(grouping.measures);
    const field = dimensions[path.length]!.field;
    const records = matching(request, criteria);
    const buckets = groupRecords(records, field, isDescending(request.sort, field));
    const page = pageOf<Bucket<TData>>(buckets, request.range, how, EXTRA_BUCKET);
    const nodes = page.map((bucket) => nodeOf(bucket, grouping, path.length));
    const response: ServerGroupChildrenResponse = {
      revision: revisionFor(how),
      totalCount: countFor(buckets.length, how),
      children: how === "object-key" ? withObjectKey(nodes) : nodes,
    };
    if (path.length === 0) response.totals = foldMeasures(records, grouping.measures);
    return response;
  };

  const leavesOf = (request: ServerLeavesRequest, how: Fault | undefined): ServerLeavesResponse<TData> => {
    const criteria = criteriaOf(request.grouping, request.path, request.grouping.dimensions.length);
    const records = sortRecords(matching(request, criteria), request.sort);
    return {
      revision: revisionFor(how),
      totalCount: countFor(records.length, how),
      rows: pageOf(records, request.range, how, rows[0]),
    };
  };

  const respond = <T>(entry: MockRequestEntry, answer: (how: Fault | undefined) => T): Promise<T> => {
    requests.push(entry);
    const fault = faults[entry.kind].shift();
    return new Promise<T>((resolve, reject) => {
      const settle = () => {
        entry.aborted = entry.request.signal?.aborted ?? false;
        if (fault === "fail") {
          reject(new Error("mock failure"));
          return;
        }
        try {
          resolve(answer(fault));
        } catch (error) {
          reject(error);
        }
      };
      if (holding) queue.push(settle);
      else settle();
    });
  };

  const corruptNext = (kind: MockRequestKind, how: MockCorruption): void => {
    if (kind === "leaves" && how === "object-key") {
      throw new RangeError("Mock grouping: a leaf page has no key to corrupt");
    }
    faults[kind].push(how);
  };

  return {
    get revision() {
      return revision;
    },
    requests,
    fetchChildren: (request) =>
      respond({ kind: "children", request, aborted: false }, (how) => childrenOf(request, how)),
    fetchLeaves: (request) =>
      respond({ kind: "leaves", request, aborted: false }, (how) => leavesOf(request, how)),
    hold: () => {
      holding = true;
    },
    release: (count) => {
      for (const settle of queue.splice(0, count ?? queue.length)) settle();
    },
    failNext: (kind) => {
      faults[kind].push("fail");
    },
    corruptNext,
    bumpRevision: () => {
      revision += 1;
      return revision;
    },
  };
};
