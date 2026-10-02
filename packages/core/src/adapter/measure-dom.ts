// packages/core/src/adapter/measure-dom.ts
// The DOM half of a one-shot fit (PRD 007 D2): the only module that writes a
// measuring style. No observer, no timer and no state.

import type {
  ColumnMeasurement,
  MeasurementHost,
  RowMeasurement,
} from "../types/measurement";

type Dimension = "width" | "height";

const INTRINSIC_SIZE: Record<Dimension, string> = {
  width: "max-content",
  height: "auto",
};

const BODY_CELL = ":not(.gp-grid-cell--editing)";

/** An element to measure, the index it answers for and its cross-axis index. */
interface MeasureTarget {
  readonly element: HTMLElement;
  readonly index: number;
  readonly cross: number | null;
}

const readInteger = (element: Element, attribute: string): number =>
  Number.parseInt(element.getAttribute(attribute) ?? "", 10);

/** A hidden or zero-sized container has nothing to measure against. */
const readRoot = (getRoot: () => HTMLElement | null): HTMLElement | null => {
  const root = getRoot();
  if (root === null) return null;
  if (root.clientWidth === 0 || root.clientHeight === 0) return null;
  return root;
};

/** A root without a valid revision never matches the core's, so the fit is stale. */
const readLayoutRevision = (root: HTMLElement): number => {
  const revision = readInteger(root, "data-layout-revision");
  return Number.isSafeInteger(revision) ? revision : -1;
};

const collect = (
  root: HTMLElement,
  selector: string,
  indexAttribute: string,
  crossAttribute: string | null,
  requested: ReadonlySet<number>,
): MeasureTarget[] => {
  const targets: MeasureTarget[] = [];
  // Array.from: a NodeList is not iterable under the DOM lib without DOM.Iterable.
  for (const element of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
    const index = readInteger(element, indexAttribute);
    if (requested.has(index) === false) continue;
    const cross = crossAttribute === null ? null : readInteger(element, crossAttribute);
    targets.push({ element, index, cross });
  }
  return targets;
};

interface SavedStyle {
  readonly element: HTMLElement;
  readonly value: string;
  readonly priority: string;
  readonly hadAttribute: boolean;
}

// CSSOM writes only: a strict CSP blocks setting the style attribute itself.
const restoreStyle = (saved: SavedStyle, dimension: Dimension): void => {
  const { element, value, priority, hadAttribute } = saved;
  if (value === "") element.style.removeProperty(dimension);
  else element.style.setProperty(dimension, value, priority);
  if (hadAttribute === false) element.removeAttribute("style");
};

/**
 * Three passes in one task: every element takes its intrinsic size, every box
 * is read in one layout, and every previous inline value is put back.
 */
const measureBoxes = (targets: readonly MeasureTarget[], dimension: Dimension): number[] => {
  const saved = targets.map(({ element }): SavedStyle => ({
    element,
    value: element.style.getPropertyValue(dimension),
    priority: element.style.getPropertyPriority(dimension),
    hadAttribute: element.hasAttribute("style"),
  }));
  // `important` so a stylesheet's `!important` size cannot mask the content.
  for (const { element } of targets) {
    element.style.setProperty(dimension, INTRINSIC_SIZE[dimension], "important");
  }
  const sizes = targets.map(({ element }) => element.getBoundingClientRect()[dimension]);
  for (const entry of saved) restoreStyle(entry, dimension);
  return sizes;
};

/** Largest box per index, and the number of distinct cross-axis indexes read. */
const summarize = (
  targets: readonly MeasureTarget[],
  sizes: readonly number[],
): { sizes: Map<number, number>; considered: number } => {
  const largest = new Map<number, number>();
  const cross = new Set<number>();
  targets.forEach((target, position) => {
    const size = sizes[position] ?? 0;
    largest.set(target.index, Math.max(largest.get(target.index) ?? 0, size));
    if (target.cross !== null) cross.add(target.cross);
  });
  return { sizes: largest, considered: cross.size };
};

const readRows = (root: HTMLElement, rowIndexes: readonly number[]): RowMeasurement => {
  const targets = collect(
    root,
    `[data-cell-row]${BODY_CELL}`,
    "data-cell-row",
    "data-cell-col",
    new Set(rowIndexes),
  );
  const { sizes, considered } = summarize(targets, measureBoxes(targets, "height"));
  return {
    layoutRevision: readLayoutRevision(root),
    heights: sizes,
    consideredColumns: considered,
  };
};

const readColumns = (
  root: HTMLElement,
  layoutIndexes: readonly number[],
): ColumnMeasurement => {
  const requested = new Set(layoutIndexes);
  const targets = [
    ...collect(root, "[data-col-index]", "data-col-index", null, requested),
    ...collect(root, `[data-cell-col]${BODY_CELL}`, "data-cell-col", "data-cell-row", requested),
  ];
  const { sizes, considered } = summarize(targets, measureBoxes(targets, "width"));
  return {
    layoutRevision: readLayoutRevision(root),
    widths: sizes,
    consideredRows: considered,
  };
};

/**
 * Measurement host over the grid root: header cells by `data-col-index`, body
 * cells by `data-cell-row`/`data-cell-col`, editing cells skipped. Boxes are
 * border boxes, so padding and borders count and no computed style is read.
 */
export const createDomMeasurementHost = (
  getRoot: () => HTMLElement | null,
): MeasurementHost => ({
  measureRows: (rowIndexes) => {
    const root = readRoot(getRoot);
    return root === null ? null : readRows(root, rowIndexes);
  },
  measureColumns: (layoutIndexes) => {
    const root = readRoot(getRoot);
    return root === null ? null : readColumns(root, layoutIndexes);
  },
});
