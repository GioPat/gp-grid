// packages/core/tests/filtering.test.ts
// Covers the operator lookup tables, the selectedValues checkbox branch,
// the AND/OR combinator in evaluateColumnFilter, and the legacy-string
// path in applyFilters.

import { describe, it, expect } from "vitest";
import {
  evaluateTextCondition,
  evaluateNumberCondition,
  evaluateDateCondition,
  evaluateColumnFilter,
  applyFilters,
} from "../src/filtering";
import type {
  CellValue,
  TextFilterCondition,
  NumberFilterCondition,
  DateFilterCondition,
  ColumnFilterModel,
  LegacyColumnFilterModel,
  FilterModel,
} from "../src/types";

// Helper to make an operator-form text condition without selectedValues
const textOp = (operator: TextFilterCondition["operator"], value?: string): TextFilterCondition => ({
  type: "text",
  operator,
  value,
});

const numOp = (
  operator: NumberFilterCondition["operator"],
  value?: number,
  valueTo?: number,
): NumberFilterCondition => ({ type: "number", operator, value, valueTo });

const dateOp = (
  operator: DateFilterCondition["operator"],
  value?: Date,
  valueTo?: Date,
): DateFilterCondition => ({ type: "date", operator, value, valueTo });

describe("evaluateTextCondition — operator table", () => {
  it("contains: substring match, case-insensitive", () => {
    expect(evaluateTextCondition("Hello World", textOp("contains", "WORLD"))).toBe(true);
    expect(evaluateTextCondition("Hello", textOp("contains", "xyz"))).toBe(false);
  });

  it("notContains: inverse of contains", () => {
    expect(evaluateTextCondition("Hello", textOp("notContains", "xyz"))).toBe(true);
    expect(evaluateTextCondition("Hello", textOp("notContains", "ELL"))).toBe(false);
  });

  it("equals / notEquals: full string match, case-insensitive", () => {
    expect(evaluateTextCondition("Hello", textOp("equals", "hello"))).toBe(true);
    expect(evaluateTextCondition("Hello", textOp("equals", "hell"))).toBe(false);
    expect(evaluateTextCondition("Hello", textOp("notEquals", "hell"))).toBe(true);
    expect(evaluateTextCondition("Hello", textOp("notEquals", "hello"))).toBe(false);
  });

  it("startsWith / endsWith", () => {
    expect(evaluateTextCondition("Hello World", textOp("startsWith", "HELLO"))).toBe(true);
    expect(evaluateTextCondition("Hello World", textOp("startsWith", "World"))).toBe(false);
    expect(evaluateTextCondition("Hello World", textOp("endsWith", "WORLD"))).toBe(true);
    expect(evaluateTextCondition("Hello World", textOp("endsWith", "Hello"))).toBe(false);
  });

  it("blank: true for null, undefined, empty string, empty array", () => {
    expect(evaluateTextCondition(null, textOp("blank"))).toBe(true);
    expect(evaluateTextCondition("", textOp("blank"))).toBe(true);
    expect(evaluateTextCondition([], textOp("blank"))).toBe(true);
    expect(evaluateTextCondition("x", textOp("blank"))).toBe(false);
  });

  it("notBlank: inverse of blank", () => {
    expect(evaluateTextCondition(null, textOp("notBlank"))).toBe(false);
    expect(evaluateTextCondition("", textOp("notBlank"))).toBe(false);
    expect(evaluateTextCondition([], textOp("notBlank"))).toBe(false);
    expect(evaluateTextCondition("x", textOp("notBlank"))).toBe(true);
  });
});

describe("evaluateTextCondition — selectedValues (checkbox) branch", () => {
  const valuesCondition = (selectedValues: Set<CellValue>): TextFilterCondition => ({
    type: "text",
    operator: "contains", // ignored when selectedValues is present
    selectedValues,
  });

  it("matches when the cell's raw value is in the set", () => {
    const condition = valuesCondition(new Set<CellValue>(["Alice", "Bob"]));
    expect(evaluateTextCondition("Alice", condition)).toBe(true);
    expect(evaluateTextCondition("Carol", condition)).toBe(false);
  });

  it("non-string raws match by raw identity: 5 matches 5, not \"5\"", () => {
    const condition = valuesCondition(new Set<CellValue>([5]));
    expect(evaluateTextCondition(5, condition)).toBe(true);
    expect(evaluateTextCondition("5", condition)).toBe(false);

    const stringCondition = valuesCondition(new Set<CellValue>(["5"]));
    expect(evaluateTextCondition(5, stringCondition)).toBe(false);
  });

  it("the formatter is ignored in values mode — raw values, not labels, match", () => {
    const formatter = (): string => "LABEL";
    const labelCondition = valuesCondition(new Set<CellValue>(["LABEL"]));
    expect(evaluateTextCondition("a", labelCondition, formatter)).toBe(false);

    const rawCondition = valuesCondition(new Set<CellValue>(["a"]));
    expect(evaluateTextCondition("a", rawCondition, formatter)).toBe(true);
  });

  it("label collisions: every selected raw value matches independently", () => {
    // Two dates sharing a "January" label both travel in the model as raws.
    const jan3 = new Date("2026-01-03");
    const jan20 = new Date("2026-01-20");
    const condition = valuesCondition(new Set<CellValue>([jan3, jan20]));
    // Equal-time Date instances match even if they are different objects.
    expect(evaluateTextCondition(new Date("2026-01-03"), condition)).toBe(true);
    expect(evaluateTextCondition(new Date("2026-01-20"), condition)).toBe(true);
    expect(evaluateTextCondition(new Date("2026-02-01"), condition)).toBe(false);
  });

  it("includeBlank: controls whether blank cells pass", () => {
    const withBlank: TextFilterCondition = {
      type: "text",
      operator: "contains",
      selectedValues: new Set<CellValue>(["Alice"]),
      includeBlank: true,
    };
    expect(evaluateTextCondition(null, withBlank)).toBe(true);
    expect(evaluateTextCondition("", withBlank)).toBe(true);
    // Non-blank cells still go through the Set check
    expect(evaluateTextCondition("Carol", withBlank)).toBe(false);

    const withoutBlank: TextFilterCondition = {
      type: "text",
      operator: "contains",
      selectedValues: new Set<CellValue>(["Alice"]),
      includeBlank: false,
    };
    expect(evaluateTextCondition(null, withoutBlank)).toBe(false);
    expect(evaluateTextCondition("", withoutBlank)).toBe(false);
    expect(evaluateTextCondition("Alice", withoutBlank)).toBe(true);
  });

  it("empty selectedValues stays in values mode: only blanks can pass", () => {
    // Popup state after "Deselect All" + ticking "(Blanks)". Must not fall
    // through to the free-text operator (contains "" matches everything).
    const blanksOnly: TextFilterCondition = {
      type: "text",
      operator: "contains",
      selectedValues: new Set<CellValue>(),
      includeBlank: true,
    };
    expect(evaluateTextCondition(null, blanksOnly)).toBe(true);
    expect(evaluateTextCondition("", blanksOnly)).toBe(true);
    expect(evaluateTextCondition([], blanksOnly)).toBe(true);
    expect(evaluateTextCondition("Alice", blanksOnly)).toBe(false);

    const nothingSelected: TextFilterCondition = {
      type: "text",
      operator: "contains",
      selectedValues: new Set<CellValue>(),
      includeBlank: false,
    };
    expect(evaluateTextCondition(null, nothingSelected)).toBe(false);
    expect(evaluateTextCondition("Alice", nothingSelected)).toBe(false);
  });

  it("array cells: raw arrays match regardless of element order", () => {
    const condition = valuesCondition(new Set<CellValue>([["apple", "banana"]]));
    expect(evaluateTextCondition(["banana", "apple"], condition)).toBe(true);
    expect(evaluateTextCondition(["cherry"], condition)).toBe(false);
    // The old formatted-label form no longer matches.
    const joinedCondition = valuesCondition(new Set<CellValue>(["apple, banana"]));
    expect(evaluateTextCondition(["banana", "apple"], joinedCondition)).toBe(false);
  });
});

describe("evaluateNumberCondition — operator table", () => {
  it("=, !=, >, <, >=, <=", () => {
    expect(evaluateNumberCondition(5, numOp("=", 5))).toBe(true);
    expect(evaluateNumberCondition(5, numOp("=", 4))).toBe(false);
    expect(evaluateNumberCondition(5, numOp("!=", 5))).toBe(false);
    expect(evaluateNumberCondition(5, numOp("!=", 4))).toBe(true);
    expect(evaluateNumberCondition(5, numOp(">", 4))).toBe(true);
    expect(evaluateNumberCondition(5, numOp(">", 5))).toBe(false);
    expect(evaluateNumberCondition(5, numOp("<", 6))).toBe(true);
    expect(evaluateNumberCondition(5, numOp("<", 5))).toBe(false);
    expect(evaluateNumberCondition(5, numOp(">=", 5))).toBe(true);
    expect(evaluateNumberCondition(5, numOp(">=", 6))).toBe(false);
    expect(evaluateNumberCondition(5, numOp("<=", 5))).toBe(true);
    expect(evaluateNumberCondition(5, numOp("<=", 4))).toBe(false);
  });

  it("between: inclusive at both endpoints", () => {
    expect(evaluateNumberCondition(5, numOp("between", 1, 5))).toBe(true);
    expect(evaluateNumberCondition(5, numOp("between", 5, 10))).toBe(true);
    expect(evaluateNumberCondition(5, numOp("between", 6, 10))).toBe(false);
  });

  it("blank / notBlank: short-circuit before numeric conversion", () => {
    expect(evaluateNumberCondition(null, numOp("blank"))).toBe(true);
    expect(evaluateNumberCondition("", numOp("blank"))).toBe(true);
    // Non-blank cells fail a blank check
    expect(evaluateNumberCondition(0, numOp("blank"))).toBe(false);
    // notBlank is the inverse
    expect(evaluateNumberCondition(null, numOp("notBlank"))).toBe(false);
    expect(evaluateNumberCondition("", numOp("notBlank"))).toBe(false);
    expect(evaluateNumberCondition(0, numOp("notBlank"))).toBe(true);
  });

  it("non-blank cell with blank/notBlank operator: short-circuits on isBlank value", () => {
    // When operator is "blank", returns isBlank regardless of numeric value.
    expect(evaluateNumberCondition(5, numOp("blank"))).toBe(false);
  });

  it("non-numeric cell with a numeric operator: returns false (NaN guard)", () => {
    expect(evaluateNumberCondition("abc", numOp(">", 0))).toBe(false);
  });

  it("blank cell with a numeric operator (not blank/notBlank): returns false", () => {
    expect(evaluateNumberCondition(null, numOp(">", 0))).toBe(false);
  });
});

describe("evaluateDateCondition — operator table", () => {
  const d = (iso: string) => new Date(iso);

  it("= uses same-day comparison (ignores time-of-day)", () => {
    expect(evaluateDateCondition(d("2026-01-15T09:00"), dateOp("=", d("2026-01-15T18:00")))).toBe(true);
    expect(evaluateDateCondition(d("2026-01-15"), dateOp("=", d("2026-01-16")))).toBe(false);
  });

  it("!=, >, <, between", () => {
    // != is inverse of same-day
    expect(evaluateDateCondition(d("2026-01-15T09:00"), dateOp("!=", d("2026-01-15T18:00")))).toBe(false);
    expect(evaluateDateCondition(d("2026-01-15"), dateOp("!=", d("2026-01-16")))).toBe(true);

    // > and < use raw getTime() comparison (time-of-day counts)
    expect(evaluateDateCondition(d("2026-01-15"), dateOp(">", d("2026-01-14")))).toBe(true);
    expect(evaluateDateCondition(d("2026-01-15"), dateOp(">", d("2026-01-16")))).toBe(false);
    expect(evaluateDateCondition(d("2026-01-15"), dateOp("<", d("2026-01-16")))).toBe(true);
    expect(evaluateDateCondition(d("2026-01-15"), dateOp("<", d("2026-01-14")))).toBe(false);

    // between is inclusive on both sides
    expect(
      evaluateDateCondition(d("2026-01-15"), dateOp("between", d("2026-01-10"), d("2026-01-20"))),
    ).toBe(true);
    expect(
      evaluateDateCondition(d("2026-01-10"), dateOp("between", d("2026-01-10"), d("2026-01-20"))),
    ).toBe(true);
    expect(
      evaluateDateCondition(d("2026-01-21"), dateOp("between", d("2026-01-10"), d("2026-01-20"))),
    ).toBe(false);
  });

  it("blank / notBlank / invalid-date handling", () => {
    // blank short-circuits on cell emptiness
    expect(evaluateDateCondition(null, dateOp("blank"))).toBe(true);
    expect(evaluateDateCondition("", dateOp("blank"))).toBe(true);
    expect(evaluateDateCondition(d("2026-01-15"), dateOp("blank"))).toBe(false);

    // notBlank is the inverse
    expect(evaluateDateCondition(null, dateOp("notBlank"))).toBe(false);
    expect(evaluateDateCondition(d("2026-01-15"), dateOp("notBlank"))).toBe(true);

    // Invalid date cell: NaN guard returns false for any comparison operator
    expect(evaluateDateCondition("not-a-date", dateOp(">", d("2026-01-15")))).toBe(false);

    // Blank cell with a comparison operator (not blank/notBlank): returns false
    expect(evaluateDateCondition(null, dateOp(">", d("2026-01-15")))).toBe(false);
    expect(evaluateDateCondition("", dateOp("=", d("2026-01-15")))).toBe(false);
  });
});

describe("evaluateColumnFilter — AND/OR combinator", () => {
  it("empty groups: returns true", () => {
    expect(evaluateColumnFilter("x", { groups: [], combination: "and" })).toBe(true);
  });

  it("distinguishes (A AND B) OR C from A AND (B OR C)", () => {
    const filter: ColumnFilterModel = {
      groups: [
        {
          conditions: [textOp("contains", "a"), textOp("contains", "b")],
          combination: "and",
        },
        { conditions: [textOp("contains", "c")], combination: "and" },
      ],
      combination: "or",
    };
    expect(evaluateColumnFilter("ab", filter)).toBe(true);
    expect(evaluateColumnFilter("c", filter)).toBe(true);
    expect(evaluateColumnFilter("a", filter)).toBe(false);

    const alternate: ColumnFilterModel = {
      groups: [
        { conditions: [textOp("contains", "a")], combination: "and" },
        {
          conditions: [textOp("contains", "b"), textOp("contains", "c")],
          combination: "or",
        },
      ],
      combination: "and",
    };
    expect(evaluateColumnFilter("ab", alternate)).toBe(true);
    expect(evaluateColumnFilter("ac", alternate)).toBe(true);
    expect(evaluateColumnFilter("bc", alternate)).toBe(false);
  });

  it("accepts legacy per-condition operators with their left-to-right semantics", () => {
    // Three conditions where global "and" would short-circuit to false at c2,
    // but c1.nextOperator = "or" promotes c1's true through c2's false.
    // Then c2.nextOperator = "and" combines the running result with c3.
    const filter: LegacyColumnFilterModel = {
      conditions: [
        { ...textOp("contains", "a"), nextOperator: "or" },
        { ...textOp("contains", "x"), nextOperator: "and" },
        textOp("contains", "b"),
      ],
      combination: "and", // would fail at c2 without override
    };
    expect(evaluateColumnFilter("ab", filter)).toBe(true);

    // Flip: c1.nextOperator = "and" overrides global "or" and forces AND semantics.
    const andOverride: LegacyColumnFilterModel = {
      conditions: [
        { ...textOp("contains", "a"), nextOperator: "and" },
        textOp("contains", "x"),
      ],
      combination: "or", // would pass without override
    };
    expect(evaluateColumnFilter("ab", andOverride)).toBe(false);
  });
});

describe("applyFilters — legacy string format + new format", () => {
  const rows = [{ name: "Alice" }, { name: "Bob" }, { name: "" }];
  const getField = (row: Record<string, unknown>, field: string) =>
    (row[field] ?? null) as string | null;

  it("legacy string filter: case-insensitive substring", () => {
    const result = applyFilters(rows, { name: "ali" }, getField);
    expect(result.map((r) => r.name)).toEqual(["Alice"]);
  });

  it("legacy empty/whitespace filter is ignored (returns all rows)", () => {
    expect(applyFilters(rows, { name: "" }, getField)).toEqual(rows);
    expect(applyFilters(rows, { name: "   " }, getField)).toEqual(rows);
  });

  it("new ColumnFilterModel format applies per-column predicates", () => {
    const filterModel: FilterModel = {
      name: {
        groups: [{ conditions: [textOp("startsWith", "A")], combination: "and" }],
        combination: "and",
      },
    };
    const result = applyFilters(rows, filterModel, getField);
    expect(result.map((r) => r.name)).toEqual(["Alice"]);
  });

  it("multiple column filters: AND across columns", () => {
    const multiRows = [
      { name: "Alice", age: "30" },
      { name: "Alice", age: "25" },
      { name: "Bob", age: "30" },
    ];
    const filterModel: FilterModel = {
      name: {
        groups: [{ conditions: [textOp("equals", "Alice")], combination: "and" }],
        combination: "and",
      },
      age: {
        groups: [{ conditions: [textOp("equals", "30")], combination: "and" }],
        combination: "and",
      },
    };
    const result = applyFilters(multiRows, filterModel, getField);
    expect(result).toEqual([{ name: "Alice", age: "30" }]);
  });
});
