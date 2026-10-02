// packages/core/src/header-layout.ts
// Header band placement, DOM ids and ARIA associations (PRD 007 D9), shared
// by every wrapper's header. Pure reads of published state: the bands, the
// column window and its fragments.

import type { HeaderFragment } from "./types/column-groups";
import type {
  ColumnRegion,
  ColumnWindowSnapshot,
  HeaderBandLayout,
  ResolvedColumn,
} from "./types/geometry";

export interface HeaderBox {
  readonly top: number;
  readonly height: number;
}

/** A leaf header spans from its first band to the bottom of the header. */
export const leafHeaderBox = (bands: HeaderBandLayout, headerBand: number): HeaderBox => {
  const top = bands.offsets[headerBand] ?? 0;
  return { top, height: bands.totalHeight - top };
};

/** A fragment fills its band. */
export const fragmentHeaderBox = (bands: HeaderBandLayout, band: number): HeaderBox => ({
  top: bands.offsets[band] ?? 0,
  height: bands.heights[band] ?? 0,
});

/**
 * One DOM id part: each character outside `[A-Za-z0-9]`, `-` and `_`
 * included, becomes `_<hex code point>_`. The id is a valid IDREF, distinct
 * parts never escape to the same text, and the only `-` left in an id are the
 * format's separators, so a leaf id never equals a fragment id.
 */
export const escapeDomIdPart = (part: string): string =>
  part.replace(/[^A-Za-z0-9]/gu, (character) => `_${character.codePointAt(0)?.toString(16)}_`);

/** `<instance>-h-<columnId>`, both parts escaped. */
export const leafHeaderId = (instance: string, columnId: string): string =>
  `${escapeDomIdPart(instance)}-h-${escapeDomIdPart(columnId)}`;

/** `<instance>-<fragmentId>`, both parts escaped. */
export const fragmentHeaderId = (instance: string, fragmentId: string): string =>
  `${escapeDomIdPart(instance)}-${escapeDomIdPart(fragmentId)}`;

export interface HeaderAssociations {
  /** `aria-describedby` of each mounted leaf with a mounted ancestor, by column id. */
  readonly describedBy: ReadonlyMap<string, string>;
  /** `aria-owns` of each band row: the mounted headers starting in that band. */
  readonly owns: readonly string[];
}

const REGIONS: readonly ColumnRegion[] = ["start", "center", "end"];

/** One region's fragments per band, each band in display order. */
const fragmentsByBand = (
  fragments: readonly HeaderFragment[],
  bandCount: number,
): HeaderFragment[][] => {
  const byBand = Array.from({ length: bandCount }, (): HeaderFragment[] => []);
  for (const fragment of fragments) byBand[fragment.band]?.push(fragment);
  return byBand;
};

/** The fragment of a band whose run holds `displayIndex`, by binary search. */
const fragmentAt = (
  runs: readonly HeaderFragment[],
  displayIndex: number,
): HeaderFragment | undefined => {
  let low = 0;
  let high = runs.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const run = runs[middle]!;
    if (run.firstDisplayIndex + run.leafCount <= displayIndex) low = middle + 1;
    else high = middle;
  }
  const run = runs[low];
  return run !== undefined && run.firstDisplayIndex <= displayIndex ? run : undefined;
};

interface OwnedHeader {
  readonly displayIndex: number;
  readonly id: string;
}

export interface HeaderAssociationInput {
  readonly instance: string;
  readonly columnWindow: ColumnWindowSnapshot;
  readonly bandCount: number;
  readonly displayedIndexOf: (columnId: string) => number;
}

/** Ancestor fragment ids of one leaf, outermost first. */
const ancestorIds = (
  input: HeaderAssociationInput,
  column: ResolvedColumn,
  byBand: readonly HeaderFragment[][],
): string[] => {
  const displayIndex = input.displayedIndexOf(column.columnId);
  const ids: string[] = [];
  for (let band = 0; band < column.headerBand; band++) {
    const fragment = fragmentAt(byBand[band] ?? [], displayIndex);
    if (fragment !== undefined) ids.push(fragmentHeaderId(input.instance, fragment.fragmentId));
  }
  return ids;
};

/**
 * Leaf descriptions and band ownership of the mounted window. Work is
 * bounded by the mounted headers times the depth.
 */
export const resolveHeaderAssociations = (input: HeaderAssociationInput): HeaderAssociations => {
  const { instance, columnWindow, bandCount, displayedIndexOf } = input;
  const describedBy = new Map<string, string>();
  const owned = Array.from({ length: bandCount }, (): OwnedHeader[] => []);
  for (const region of REGIONS) {
    const byBand = fragmentsByBand(columnWindow.groups[region], bandCount);
    for (const fragment of columnWindow.groups[region]) {
      const id = fragmentHeaderId(instance, fragment.fragmentId);
      owned[fragment.band]?.push({ displayIndex: fragment.firstDisplayIndex, id });
    }
    for (const column of columnWindow[region]) {
      const ancestors = ancestorIds(input, column, byBand);
      if (ancestors.length > 0) describedBy.set(column.columnId, ancestors.join(" "));
      const id = leafHeaderId(instance, column.columnId);
      owned[column.headerBand]?.push({ displayIndex: displayedIndexOf(column.columnId), id });
    }
  }
  const owns = owned.map((headers) =>
    headers
      .sort((a, b) => a.displayIndex - b.displayIndex)
      .map((header) => header.id)
      .join(" "),
  );
  return { describedBy, owns };
};
