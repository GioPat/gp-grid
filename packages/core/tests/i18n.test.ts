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
import type {
  GridColumnSchemaErrorLabels,
  GridFilterOperatorLabels,
  GridLabelOverrides,
  GridLabels,
} from "../src/i18n";
import type { ColumnSchemaErrorCode } from "../src/types";

describe("resolveGridLabels", () => {
  it("returns the full English default when no overrides are given", () => {
    const labels = resolveGridLabels();
    expect(labels.emptyState).toBe("No data to display");
    expect(labels.addGroup).toBe("+ Add group");
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

  it("allows every visible label to be overridden independently", () => {
    const topLevelKeys = Object.keys(defaultGridLabels).filter(
      (key) => key !== "operators" && key !== "columnSchemaErrors",
    ) as Array<Exclude<keyof GridLabels, "operators" | "columnSchemaErrors">>;
    for (const key of topLevelKeys) {
      const customValue = `custom-${key}`;
      const overrides = { [key]: customValue } as GridLabelOverrides;
      expect(resolveGridLabels(overrides)[key]).toBe(customValue);
    }

    const operatorKeys = Object.keys(
      defaultGridLabels.operators,
    ) as Array<keyof GridFilterOperatorLabels>;
    for (const key of operatorKeys) {
      const customValue = `custom-${key}`;
      const labels = resolveGridLabels({ operators: { [key]: customValue } });
      expect(labels.operators[key]).toBe(customValue);
    }

    const schemaErrorKeys = Object.keys(
      defaultGridLabels.columnSchemaErrors,
    ) as Array<keyof GridColumnSchemaErrorLabels>;
    for (const key of schemaErrorKeys) {
      const customValue = `custom-${key}`;
      const labels = resolveGridLabels({ columnSchemaErrors: { [key]: customValue } });
      expect(labels.columnSchemaErrors[key]).toBe(customValue);
    }
  });
});

describe("columnSchemaErrors", () => {
  const codes: ColumnSchemaErrorCode[] = [
    "cycle",
    "duplicateGroup",
    "repeatedLeaf",
    "unknownLeaf",
    "missingLeaf",
    "multipleParents",
    "idCollision",
    "malformed",
    "limit",
  ];

  it("has one template per error code", () => {
    expect(Object.keys(defaultGridLabels.columnSchemaErrors).sort()).toEqual([...codes].sort());
  });

  it("interpolates the id and the limit", () => {
    const templates = defaultGridLabels.columnSchemaErrors;
    expect(formatLabel(templates.cycle, { id: "Region" })).toBe('Column group "Region" contains itself');
    expect(formatLabel(templates.unknownLeaf, { id: "zz" })).toBe('Column groups reference unknown column "zz"');
    expect(formatLabel(templates.limit, { limit: "maxDepth" })).toBe("Column groups exceed the maxDepth budget");
    for (const code of codes.filter((code) => code !== "malformed" && code !== "limit")) {
      expect(templates[code]).toContain("{id}");
    }
  });

  it("merges one level deep without mutating the defaults", () => {
    const before = defaultGridLabels.columnSchemaErrors.cycle;
    const labels = resolveGridLabels({ columnSchemaErrors: { cycle: "Ciclo in {id}" } });
    expect(labels.columnSchemaErrors.cycle).toBe("Ciclo in {id}");
    expect(labels.columnSchemaErrors.limit).toBe(defaultGridLabels.columnSchemaErrors.limit);
    expect(labels.operators).toEqual(defaultGridLabels.operators);
    expect(defaultGridLabels.columnSchemaErrors.cycle).toBe(before);
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

describe("frozenRowsLimited", () => {
  it("defaults to wording neutral enough for both directions", () => {
    expect(defaultGridLabels.frozenRowsLimited).toBe("{effective} of {requested} rows frozen");
  });

  it("interpolates both tokens", () => {
    expect(
      formatLabel(defaultGridLabels.frozenRowsLimited, { effective: 0, requested: 3 }),
    ).toBe("0 of 3 rows frozen");
    expect(
      formatLabel(defaultGridLabels.frozenRowsLimited, { effective: 2, requested: 8 }),
    ).toBe("2 of 8 rows frozen");
  });

  it("lets an override replace the template", () => {
    const labels = resolveGridLabels({ frozenRowsLimited: "{effective}/{requested} righe" });
    expect(labels.frozenRowsLimited).toBe("{effective}/{requested} righe");
    expect(formatLabel(labels.frozenRowsLimited, { effective: 1, requested: 4 })).toBe("1/4 righe");
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
