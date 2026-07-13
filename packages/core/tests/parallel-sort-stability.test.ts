// packages/core/tests/parallel-sort-stability.test.ts
// Proves the parallel/worker sort path is STABLE: rows that tie on the sort
// key keep their original input order, byte-for-byte identical to the
// synchronous, stable `applySort`.
//
// The DOM `Worker` global is unavailable under Node, so the ParallelSortManager
// cannot spin up real workers here. Instead we exercise the exact pure pieces
// the worker path is built from — the per-chunk stable sort and the k-way merge
// (where the instability lived) — faithfully replicating what
// ParallelSortManager does for numeric and multi-column sorts.

import { describe, it, expect } from "vitest";
import type { CellValue, SortModel } from "../src/types";
import { applySort, toSortableNumber } from "../src/indexed-data-store/sorting";
import { calculateChunkBoundaries } from "../src/sorting/chunk-splitter";
import {
  kWayMerge,
  kWayMergeMultiColumn,
  type SortedChunk,
  type MultiColumnSortedChunk,
} from "../src/sorting/k-way-merge";
import { reorderByIndices } from "../src/data-source/worker-sort";

// ---------------------------------------------------------------------------
// Test data + accessors
// ---------------------------------------------------------------------------

interface Row {
  id: number;
  group: number;
  bucket: number;
}

const getFieldValue = (row: Row, field: string): CellValue =>
  (row as unknown as Record<string, CellValue>)[field] ?? null;

// Build rows where `group` (and `bucket`) have MANY ties, and `id` is the
// distinct original index (0..count-1, ascending in input order).
const buildRows = (count: number, groupMod: number, bucketMod: number): Row[] => {
  const rows: Row[] = [];
  for (let i = 0; i < count; i++) {
    rows.push({ id: i, group: i % groupMod, bucket: i % bucketMod });
  }
  return rows;
};

// ---------------------------------------------------------------------------
// Faithful replica of ParallelSortManager's per-chunk stable sort.
// Sorts local indices by value, tie-breaking on the local index (identical to
// the worker's `sortIndices` / `sortMultiColumn` primitives).
// ---------------------------------------------------------------------------

const stableChunkSort = (
  values: number[],
  direction: "asc" | "desc",
): number[] => {
  const mult = direction === "asc" ? 1 : -1;
  const indices = values.map((_, i) => i);
  indices.sort((a, b) => {
    const diff = (values[a]! - values[b]!) * mult;
    if (diff !== 0) return diff;
    return a - b;
  });
  return indices;
};

// Simulate ParallelSortManager.sortIndicesParallel + reorderByIndices for a
// single numeric column, forcing multiple chunks so the k-way merge runs.
const parallelSortNumeric = (
  data: Row[],
  sort: SortModel,
  maxWorkers: number,
  minChunkSize: number,
): Row[] => {
  const direction = sort.direction ?? "asc";
  const values = data.map((row) => toSortableNumber(getFieldValue(row, sort.colId)));
  const boundaries = calculateChunkBoundaries(values.length, maxWorkers, minChunkSize);
  expect(boundaries.length).toBeGreaterThan(1); // ensure the merge is exercised

  const chunks: SortedChunk[] = boundaries.map((boundary) => {
    const slice = values.slice(boundary.offset, boundary.offset + boundary.length);
    const localSorted = stableChunkSort(slice, direction);
    return {
      indices: new Uint32Array(localSorted),
      values: new Float64Array(localSorted.map((i) => slice[i]!)),
      offset: boundary.offset,
    };
  });

  const merged = kWayMerge(chunks, direction);
  return reorderByIndices(data, merged);
};

// Simulate ParallelSortManager.sortMultiColumnParallel + reorderByIndices.
const parallelSortMultiColumn = (
  data: Row[],
  sortModel: SortModel[],
  maxWorkers: number,
  minChunkSize: number,
): Row[] => {
  const directions = new Int8Array(
    sortModel.map((s) => ((s.direction ?? "asc") === "asc" ? 1 : -1)),
  );
  const columns = sortModel.map((s) =>
    data.map((row) => toSortableNumber(getFieldValue(row, s.colId))),
  );
  const boundaries = calculateChunkBoundaries(data.length, maxWorkers, minChunkSize);
  expect(boundaries.length).toBeGreaterThan(1);

  const chunks: MultiColumnSortedChunk[] = boundaries.map((boundary) => {
    const sliceCols = columns.map((col) =>
      col.slice(boundary.offset, boundary.offset + boundary.length),
    );
    const localSorted = multiColumnChunkSort(sliceCols, directions);
    return {
      indices: new Uint32Array(localSorted),
      columns: sliceCols.map((col) => new Float64Array(localSorted.map((i) => col[i]!))),
      directions,
      offset: boundary.offset,
    };
  });

  const merged = kWayMergeMultiColumn(chunks);
  return reorderByIndices(data, merged);
};

const multiColumnChunkSort = (columns: number[][], directions: Int8Array): number[] => {
  const indices = columns[0]!.map((_, i) => i);
  indices.sort((a, b) => {
    for (let c = 0; c < columns.length; c++) {
      const diff = (columns[c]![a]! - columns[c]![b]!) * directions[c]!;
      if (diff !== 0) return diff;
    }
    return a - b;
  });
  return indices;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parallel sort stability", () => {
  it("kWayMerge: tied values across chunks come out in global-index order", () => {
    // Two chunks whose values all tie (every value is 7). A stable merge must
    // emit ALL of chunk 0 before chunk 1 (ascending global index), never
    // interleave them. offset makes global index = local + offset.
    const chunkA: SortedChunk = {
      indices: new Uint32Array([0, 1, 2]),
      values: new Float64Array([7, 7, 7]),
      offset: 0,
    };
    const chunkB: SortedChunk = {
      indices: new Uint32Array([0, 1, 2]),
      values: new Float64Array([7, 7, 7]),
      offset: 3,
    };
    const merged = Array.from(kWayMerge([chunkA, chunkB], "asc"));
    expect(merged).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("kWayMerge (desc): tied values still emit in ascending global-index order", () => {
    const chunkA: SortedChunk = {
      indices: new Uint32Array([0, 1]),
      values: new Float64Array([9, 9]),
      offset: 0,
    };
    const chunkB: SortedChunk = {
      indices: new Uint32Array([0, 1]),
      values: new Float64Array([9, 9]),
      offset: 2,
    };
    const merged = Array.from(kWayMerge([chunkA, chunkB], "desc"));
    expect(merged).toEqual([0, 1, 2, 3]);
  });

  it("numeric worker path with many ties equals stable applySort (asc)", () => {
    const rows = buildRows(1000, 5, 7); // 200 rows per group value
    const sort: SortModel[] = [{ colId: "group", direction: "asc" }];

    const worker = parallelSortNumeric(rows, sort[0]!, 8, 60);
    const reference = applySort(rows, sort, getFieldValue);

    expect(worker).toEqual(reference);

    // Explicit stability assertion: within each group the ids stay ascending
    // (original order), never interleaved into two runs.
    assertTiesAscendingById(worker, "group");
  });

  it("numeric worker path with many ties equals stable applySort (desc)", () => {
    const rows = buildRows(1000, 4, 7);
    const sort: SortModel[] = [{ colId: "group", direction: "desc" }];

    const worker = parallelSortNumeric(rows, sort[0]!, 8, 60);
    const reference = applySort(rows, sort, getFieldValue);

    expect(worker).toEqual(reference);
    assertTiesAscendingById(worker, "group");
  });

  it("multi-column worker path is stable and equals applySort", () => {
    const rows = buildRows(1000, 3, 6);
    const sortModel: SortModel[] = [
      { colId: "group", direction: "asc" },
      { colId: "bucket", direction: "asc" },
    ];

    const worker = parallelSortMultiColumn(rows, sortModel, 8, 60);
    const reference = applySort(rows, sortModel, getFieldValue);

    expect(worker).toEqual(reference);

    // Rows sharing both group and bucket must keep ascending id order.
    for (let i = 1; i < worker.length; i++) {
      const prev = worker[i - 1]!;
      const curr = worker[i]!;
      if (prev.group === curr.group && prev.bucket === curr.bucket) {
        expect(curr.id).toBeGreaterThan(prev.id);
      }
    }
  });
});

const assertTiesAscendingById = (rows: Row[], field: keyof Row): void => {
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]!;
    const curr = rows[i]!;
    if (prev[field] === curr[field]) {
      expect(curr.id).toBeGreaterThan(prev.id);
    }
  }
};
