// packages/core/src/filtering/distinct-entries.ts
// Grouping of raw distinct values under display labels for the values-mode
// (checkbox) filter popup. The filter model stores RAW values; labels exist
// only in the popup UI. Shared by the react/vue/angular wrappers.

import type { CellValue } from "../types/basic";
import { formatCellValue } from "../utils/format-helpers";

/** One checkbox row in the values-mode filter popup. */
export interface DistinctValueEntry {
  /** Formatted display string shown next to the checkbox. */
  label: string;
  /** All raw values that format to this label. Ticking the label selects them all. */
  values: CellValue[];
}

/**
 * Sort array elements by their canonical {@link rawValueKey} so element order
 * never affects an array's identity. Keys are used instead of raw
 * stringification because object elements would all collapse to
 * `[object Object]` and sort non-deterministically. Mutually recursive with
 * `rawValueKey` for nested arrays; both are only called at runtime.
 */
const sortArrayLexicographic = (value: CellValue[]): CellValue[] => {
  return value
    .map((item) => ({ item, key: rawValueKey(item) }))
    .sort((a, b) => {
      if (a.key === b.key) return 0;
      return a.key < b.key ? -1 : 1;
    })
    .map((keyed) => keyed.item);
};

/**
 * Canonical identity key for a raw cell value, used to compare values-mode
 * selections against cell values without ever consulting a formatter.
 *
 * Type-prefixed so raw `5` and raw `"5"` never collide. Arrays are sorted by
 * their elements' own keys first so element order is irrelevant (same rule as
 * the distinct-value scan). Objects rely on JSON.stringify, so key order matters
 * for them — a pre-existing limitation of distinct-value identity.
 */
export const rawValueKey = (value: CellValue): string => {
  if (value == null) return "x:null";
  if (typeof value === "string") return `s:${value}`;
  if (typeof value === "number") return `n:${String(value)}`;
  if (typeof value === "boolean") return `b:${String(value)}`;
  if (value instanceof Date) return `d:${String(value.getTime())}`;
  if (Array.isArray(value)) return `a:${JSON.stringify(sortArrayLexicographic(value))}`;
  return `o:${JSON.stringify(value)}`;
};

/**
 * Whether a cell value counts as blank for filtering purposes: null,
 * undefined, empty string, or empty array (e.g. a tags column with no tags).
 * Blank cells are matched via `TextFilterCondition.includeBlank` — the
 * popup's "(Blanks)" checkbox — never via `selectedValues`.
 */
export const isBlankCellValue = (value: CellValue): boolean => {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0);
};

const compareLabels = (a: string, b: string): number => {
  const numA = Number.parseFloat(a);
  const numB = Number.parseFloat(b);
  if (Number.isNaN(numA) === false && Number.isNaN(numB) === false) return numA - numB;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
};

/**
 * Group raw distinct values by their display label.
 *
 * Multiple raw values can format to the same label; the returned entry keeps
 * every one of them so that applying the filter selects all rows rendering
 * that label. Blank values are skipped (the popup exposes them through the
 * dedicated "include blanks" checkbox), arrays are normalized to sorted
 * copies, and raws are deduplicated within a group by {@link rawValueKey}.
 */
export const groupDistinctValues = (
  values: readonly CellValue[],
  formatter?: (v: CellValue) => string,
): DistinctValueEntry[] => {
  const groups = new Map<string, { entry: DistinctValueEntry; seen: Set<string> }>();
  for (const value of values) {
    if (isBlankCellValue(value)) continue;
    const normalized = Array.isArray(value) ? sortArrayLexicographic(value) : value;
    const key = rawValueKey(normalized);
    const label = formatCellValue(normalized, formatter);
    let group = groups.get(label);
    if (group === undefined) {
      group = { entry: { label, values: [] }, seen: new Set() };
      groups.set(label, group);
    }
    if (group.seen.has(key)) continue;
    group.seen.add(key);
    group.entry.values.push(normalized);
  }
  const entries = Array.from(groups.values(), (g) => g.entry);
  entries.sort((a, b) => compareLabels(a.label, b.label));
  return entries;
};

/**
 * Map a filter model's raw `selectedValues` back to the popup labels that
 * should render as ticked. A label is ticked when at least one of its raw
 * values is selected (data may have changed since the filter was applied).
 */
export const labelsForSelectedValues = (
  entries: readonly DistinctValueEntry[],
  selectedValues: ReadonlySet<CellValue>,
): Set<string> => {
  const selectedKeys = new Set<string>();
  for (const value of selectedValues) selectedKeys.add(rawValueKey(value));
  const labels = new Set<string>();
  for (const entry of entries) {
    const hasSelected = entry.values.some((v) => selectedKeys.has(rawValueKey(v)));
    if (hasSelected) labels.add(entry.label);
  }
  return labels;
};

/**
 * Collect the raw values behind the ticked labels — the set to store in
 * `TextFilterCondition.selectedValues` on apply.
 */
export const rawValuesForLabels = (
  entries: readonly DistinctValueEntry[],
  labels: ReadonlySet<string>,
): Set<CellValue> => {
  const raws = new Set<CellValue>();
  for (const entry of entries) {
    if (labels.has(entry.label) === false) continue;
    for (const value of entry.values) raws.add(value);
  }
  return raws;
};
