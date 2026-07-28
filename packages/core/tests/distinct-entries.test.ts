// packages/core/tests/distinct-entries.test.ts
// Covers rawValueKey identity, groupDistinctValues label grouping (including
// formatter-induced label collisions), and the label<->raw mappings used by
// the values-mode filter popups.

import { describe, it, expect } from "vitest";
import {
  rawValueKey,
  groupDistinctValues,
  labelsForSelectedValues,
  rawValuesForLabels,
  isBlankCellValue,
} from "../src/filtering/distinct-entries";
import type { CellValue } from "../src/types";

describe("rawValueKey", () => {
  it("distinguishes a number from its numeric string", () => {
    expect(rawValueKey(5)).not.toBe(rawValueKey("5"));
  });

  it("equal-time Date instances collide; different times do not", () => {
    expect(rawValueKey(new Date("2026-01-03"))).toBe(rawValueKey(new Date("2026-01-03")));
    expect(rawValueKey(new Date("2026-01-03"))).not.toBe(rawValueKey(new Date("2026-01-04")));
  });

  it("arrays are order-insensitive", () => {
    expect(rawValueKey(["b", "a"])).toBe(rawValueKey(["a", "b"]));
    expect(rawValueKey(["a", "b"])).not.toBe(rawValueKey(["a", "c"]));
  });

  it("booleans and null have distinct keys from their string forms", () => {
    expect(rawValueKey(true)).not.toBe(rawValueKey("true"));
    expect(rawValueKey(null)).not.toBe(rawValueKey("null"));
  });
});

describe("isBlankCellValue", () => {
  it("treats null, undefined, empty string, and empty array as blank", () => {
    expect(isBlankCellValue(null)).toBe(true);
    expect(isBlankCellValue("")).toBe(true);
    // A tags column with no tags is blank — the popups use this to decide
    // whether to render the "(Blanks)" opt-out checkbox.
    expect(isBlankCellValue([])).toBe(true);
    expect(isBlankCellValue("x")).toBe(false);
    expect(isBlankCellValue(0)).toBe(false);
    expect(isBlankCellValue(false)).toBe(false);
    expect(isBlankCellValue(["a"])).toBe(false);
  });
});

describe("groupDistinctValues", () => {
  it("groups raw values sharing a formatted label into one entry", () => {
    const jan3 = new Date("2026-01-03");
    const jan20 = new Date("2026-01-20");
    const feb15 = new Date("2026-02-15");
    const monthFormatter = (v: CellValue): string =>
      (v as Date).toLocaleString("en-US", { month: "long" });

    const entries = groupDistinctValues([jan3, jan20, feb15], monthFormatter);
    expect(entries.map((e) => e.label)).toEqual(["February", "January"]);
    const january = entries.find((e) => e.label === "January");
    expect(january?.values).toEqual([jan3, jan20]);
  });

  it("skips blanks and dedups raws within a group", () => {
    const entries = groupDistinctValues([null, "", [], "a", "a", "b"]);
    expect(entries.map((e) => e.label)).toEqual(["a", "b"]);
    expect(entries[0]?.values).toEqual(["a"]);
  });

  it("normalizes array values to a sorted copy", () => {
    const entries = groupDistinctValues([["banana", "apple"]]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.values).toEqual([["apple", "banana"]]);
  });

  it("sorts labels numerically when both parse as numbers", () => {
    const entries = groupDistinctValues([10, 2, 1]);
    expect(entries.map((e) => e.label)).toEqual(["1", "2", "10"]);
  });
});

describe("labelsForSelectedValues / rawValuesForLabels", () => {
  const formatter = (v: CellValue): string => (typeof v === "number" && v < 10 ? "small" : "big");
  const entries = groupDistinctValues([1, 2, 50], formatter);

  it("round-trips: ticking a label yields all its raws, which map back to the label", () => {
    const raws = rawValuesForLabels(entries, new Set(["small"]));
    expect([...raws]).toEqual([1, 2]);
    const labels = labelsForSelectedValues(entries, raws);
    expect([...labels]).toEqual(["small"]);
  });

  it("a label is ticked when at least one of its raws is selected", () => {
    const labels = labelsForSelectedValues(entries, new Set<CellValue>([2]));
    expect(labels.has("small")).toBe(true);
    expect(labels.has("big")).toBe(false);
  });

  it("selected raws unknown to the entries produce no labels", () => {
    const labels = labelsForSelectedValues(entries, new Set<CellValue>([999]));
    expect(labels.size).toBe(0);
  });
});
