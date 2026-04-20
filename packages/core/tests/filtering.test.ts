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
  TextFilterCondition,
  NumberFilterCondition,
  DateFilterCondition,
  ColumnFilterModel,
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
  it("matches when the cell's stringified value is in the set", () => {
    const condition: TextFilterCondition = {
      type: "text",
      operator: "contains", // ignored when selectedValues is present
      selectedValues: new Set(["Alice", "Bob"]),
    };
    expect(evaluateTextCondition("Alice", condition)).toBe(true);
    expect(evaluateTextCondition("Carol", condition)).toBe(false);
  });

  it("includeBlank: controls whether blank cells pass", () => {
    const withBlank: TextFilterCondition = {
      type: "text",
      operator: "contains",
      selectedValues: new Set(["Alice"]),
      includeBlank: true,
    };
    expect(evaluateTextCondition(null, withBlank)).toBe(true);
    expect(evaluateTextCondition("", withBlank)).toBe(true);
    // Non-blank cells still go through the Set check
    expect(evaluateTextCondition("Carol", withBlank)).toBe(false);

    const withoutBlank: TextFilterCondition = {
      type: "text",
      operator: "contains",
      selectedValues: new Set(["Alice"]),
      includeBlank: false,
    };
    expect(evaluateTextCondition(null, withoutBlank)).toBe(false);
    expect(evaluateTextCondition("", withoutBlank)).toBe(false);
    expect(evaluateTextCondition("Alice", withoutBlank)).toBe(true);
  });

  it("array cells: matches against sorted-joined key", () => {
    // The condition.selectedValues was built from keys produced by
    // getDistinctValuesForColumn with the same sort rule.
    const condition: TextFilterCondition = {
      type: "text",
      operator: "contains",
      selectedValues: new Set(["apple, banana"]),
    };
    // Input order should not matter — sort produces stable key.
    expect(evaluateTextCondition(["banana", "apple"], condition)).toBe(true);
    expect(evaluateTextCondition(["cherry"], condition)).toBe(false);
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
  it("empty conditions: returns true", () => {
    expect(evaluateColumnFilter("x", { conditions: [], combination: "and" })).toBe(true);
  });

  it("combines via the global `combination` when conditions lack nextOperator", () => {
    const filter: ColumnFilterModel = {
      conditions: [textOp("contains", "a"), textOp("contains", "b")],
      combination: "and",
    };
    expect(evaluateColumnFilter("ab", filter)).toBe(true);
    expect(evaluateColumnFilter("a", filter)).toBe(false);
  });

  it("per-condition nextOperator overrides the global combination", () => {
    // Three conditions where global "and" would short-circuit to false at c2,
    // but c1.nextOperator = "or" promotes c1's true through c2's false.
    // Then c2.nextOperator = "and" combines the running result with c3.
    const filter: ColumnFilterModel = {
      conditions: [
        { ...textOp("contains", "a"), nextOperator: "or" },
        { ...textOp("contains", "x"), nextOperator: "and" },
        textOp("contains", "b"),
      ],
      combination: "and", // would fail at c2 without override
    };
    expect(evaluateColumnFilter("ab", filter)).toBe(true);

    // Flip: c1.nextOperator = "and" overrides global "or" and forces AND semantics.
    const andOverride: ColumnFilterModel = {
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
      name: { conditions: [textOp("startsWith", "A")], combination: "and" },
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
      name: { conditions: [textOp("equals", "Alice")], combination: "and" },
      age: { conditions: [textOp("equals", "30")], combination: "and" },
    };
    const result = applyFilters(multiRows, filterModel, getField);
    expect(result).toEqual([{ name: "Alice", age: "30" }]);
  });
});
