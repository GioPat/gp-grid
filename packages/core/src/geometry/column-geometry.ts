// packages/core/src/geometry/column-geometry.ts
// The column half of the geometry service: region-aware x mapping, hit
// testing and clip lookup over one resolved layout. Region membership lives
// in the layout snapshot; this module only adds the queries. All inputs are
// injected numbers, so it stays pure.
//
// Every region answers binary search. Pins own a prefix axis over their
// region-local viewport edges; the center uses its content widths. A point
// before the first displayed column is `-1` and a point past the last one is
// the displayed count: callers clamp that sentinel into their index space.

import type {
  ColumnGeometryInput,
  ColumnRegion,
  ResolvedColumn,
  ResolvedColumnGeometry,
} from "../types/geometry";
import { buildOffsets, searchOffsets } from "./offsets";

/**
 * Index of the column `x` falls in, `-1` before the axis and `count` past its
 * end. Callers clamp the sentinel into their own index space.
 */
const positionAt = (offsets: readonly number[], count: number, x: number): number => {
  if (count <= 0 || Number.isNaN(x) || x < offsets[0]!) return -1;
  if (x >= offsets.at(-1)!) return count;
  return Math.min(Math.max(searchOffsets(offsets, x), 0), count - 1);
};

/** Cumulative region-local viewport-px edges of a region's columns. */
const regionEdges = (
  columns: readonly ResolvedColumn[],
  region: ColumnRegion,
): number[] => {
  const widths: number[] = [];
  for (const column of columns) {
    if (column.region === region) widths.push(column.width);
  }
  return buildOffsets(widths);
};

/** Displayed indices of the center columns, in region order. */
const centerIndices = (columns: readonly ResolvedColumn[]): number[] => {
  const indices: number[] = [];
  for (let index = 0; index < columns.length; index++) {
    if (columns[index]!.region === "center") indices.push(index);
  }
  return indices;
};

/**
 * Prefix edges of the center columns in center-local content space. Center
 * offsets are contiguous from the first center column, so the sizes are their
 * widths; scroll-independent, built once per layout.
 */
const centerEdges = (
  columns: readonly ResolvedColumn[],
  indices: readonly number[],
): number[] => buildOffsets(indices.map((index) => columns[index]!.width));

export const createColumnGeometry = (
  input: ColumnGeometryInput,
): ResolvedColumnGeometry => {
  const { columns, regions } = input;
  const byLayoutIndex = new Map(columns.map((column) => [column.layoutIndex, column]));
  const startEdges = regionEdges(columns, "start");
  const endEdges = regionEdges(columns, "end");
  const centerColumns = centerIndices(columns);
  const lastDisplayed = columns.length - 1;
  // Center-local content edges: scroll-independent, built once per layout.
  const centerAxis = centerEdges(columns, centerColumns);

  const startIndexAt = (x: number): number => {
    const position = positionAt(startEdges, regions.centerStart, x);
    // Past the last start pin the region is contiguous: the last one owns it.
    if (position === -1) return -1;
    if (position >= regions.centerStart) return Math.max(regions.centerStart - 1, -1);
    return position;
  };

  const endIndexAt = (x: number): number => {
    const count = columns.length - regions.centerEnd;
    const position = positionAt(endEdges, count, x);
    if (position === -1) return -1;
    return Math.min(regions.centerEnd + position, lastDisplayed);
  };

  return {
    columns,
    regions,
    byLayoutIndex,
    viewportLeft: (layoutIndex, scrollLeft) => {
      const column = byLayoutIndex.get(layoutIndex);
      if (column === undefined) return undefined;
      if (column.region === "start") return column.regionOffset;
      if (column.region === "end") return regions.endOffset + column.regionOffset;
      return column.offset - scrollLeft;
    },
    displayedAt: (x, scrollLeft) => {
      // A viewport x before the inline start precedes every column: no offset
      // begins below 0 and no scroll sample can pull one there.
      if (x < 0) return -1;
      // Start pins own the inline-start edge, then end pins, then center.
      if (x < regions.startWidth) return startIndexAt(x);
      if (regions.endWidth > 0 && x >= regions.endOffset) {
        // Past the last end pin the axis is exhausted: the displayed-count
        // sentinel, so consumers clamp rightwards to the last column.
        if (x >= regions.endOffset + regions.endWidth) return columns.length;
        return endIndexAt(x - regions.endOffset);
      }
      // Center columns live inside the scrolling container, so a pointer x is
      // content x less the scroll sample; the axis is center-local.
      const position = positionAt(
        centerAxis,
        centerColumns.length,
        x + scrollLeft - regions.startWidth,
      );
      // A pin covers the point before the first center column; past the last
      // one is the displayed-count sentinel input consumers clamp themselves.
      if (position === -1) return centerColumns[0] ?? -1;
      if (position >= centerColumns.length) return regions.centerEnd;
      return centerColumns[position]!;
    },
    clip: (layoutIndex) => {
      const column = byLayoutIndex.get(layoutIndex);
      if (column === undefined) return undefined;
      if (column.region === "start") {
        return { start: 0, end: regions.startWidth };
      }
      if (column.region === "end") {
        return { start: regions.endOffset, end: regions.endOffset + regions.endWidth };
      }
      return {
        start: regions.startWidth,
        end: regions.startWidth + regions.centerViewportWidth,
      };
    },
  };
};
