// packages/core/tests/i18n.test.ts
// Covers the shared label model: default completeness, deep-merge semantics,
// template interpolation, and the per-filter-type operator option helpers.

import { describe, it, expect } from "vitest";
import {
  defaultGridLabels,
  resolveGridLabels,
  formatLabel,
  getTextOperatorOptions,
  getNumberOperatorOptions,
  getDateOperatorOptions,
} from "../src/i18n";

describe("resolveGridLabels", () => {
  it("returns the full English default when no overrides are given", () => {
    const labels = resolveGridLabels();
    expect(labels.emptyState).toBe("No data to display");
    expect(labels.operators.greaterThan).toBe("Greater than");
    expect(labels).not.toBe(defaultGridLabels);
  });

  it("replaces a scalar label while keeping every other default", () => {
    const labels = resolveGridLabels({ emptyState: "Nessun dato" });
    expect(labels.emptyState).toBe("Nessun dato");
    expect(labels.apply).toBe("Apply");
    expect(labels.operators.equals).toBe("Equals");
  });

  it("deep-merges operators without clobbering sibling operator labels", () => {
    const labels = resolveGridLabels({ operators: { greaterThan: ">" } });
    expect(labels.operators.greaterThan).toBe(">");
    expect(labels.operators.lessThan).toBe("Less than");
    expect(labels.operators.between).toBe("Between");
  });

  it("does not mutate the defaults", () => {
    const before = defaultGridLabels.operators.greaterThan;
    resolveGridLabels({ operators: { greaterThan: "Superiore" } });
    expect(defaultGridLabels.operators.greaterThan).toBe(before);
  });
});

describe("formatLabel", () => {
  it("interpolates multiple tokens", () => {
    expect(
      formatLabel("Filter: {column}", { column: "Age" }),
    ).toBe("Filter: Age");
    expect(
      formatLabel("Error: {message}", { message: "boom" }),
    ).toBe("Error: boom");
  });

  it("stringifies numeric params", () => {
    expect(formatLabel("Count: {count}", { count: 42 })).toBe("Count: 42");
  });

  it("leaves unknown tokens untouched", () => {
    expect(formatLabel("Hello {world}", {})).toBe("Hello {world}");
  });

  it("does not throw on missing params", () => {
    expect(formatLabel("Filter: {column}", {})).toBe("Filter: {column}");
  });
});

describe("operator option helpers", () => {
  it("text operators use word labels in display order", () => {
    const options = getTextOperatorOptions(defaultGridLabels);
    expect(options.map((o) => o.value)).toEqual([
      "contains",
      "notContains",
      "equals",
      "notEquals",
      "startsWith",
      "endsWith",
      "blank",
      "notBlank",
    ]);
    expect(options[0]?.label).toBe("Contains");
  });

  it("number operators map symbols to semantic word labels", () => {
    const options = getNumberOperatorOptions(defaultGridLabels);
    expect(options.map((o) => o.label)).toEqual([
      "Equals",
      "Does not equal",
      "Greater than",
      "Less than",
      "Greater than or equal",
      "Less than or equal",
      "Between",
      "Is blank",
      "Is not blank",
    ]);
    expect(options[2]?.value).toBe(">");
  });

  it("date operators include only the supported inequality ops", () => {
    const options = getDateOperatorOptions(defaultGridLabels);
    expect(options.map((o) => o.value)).toEqual([
      "=",
      "!=",
      ">",
      "<",
      "between",
      "blank",
      "notBlank",
    ]);
  });

  it("reflects a custom operator label", () => {
    const labels = resolveGridLabels({ operators: { greaterThan: "Superiore" } });
    const greater = getNumberOperatorOptions(labels).find((o) => o.value === ">");
    expect(greater?.label).toBe("Superiore");
  });
});
