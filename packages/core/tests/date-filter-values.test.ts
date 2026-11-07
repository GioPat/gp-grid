import { describe, it, expect } from "vitest";
import { evaluateDateCondition } from "../src/filtering";
import {
  formatDateFilterInput,
  getDateFilterInputType,
} from "../src/filtering/date-values";
import type { DateFilterCondition } from "../src/types";

const dateOp = (
  operator: DateFilterCondition["operator"],
  value?: string,
  valueTo?: string,
): DateFilterCondition => ({ type: "date", operator, value, valueTo });

const local = (y: number, m: number, d: number, h = 0, min = 0): Date =>
  new Date(y, m - 1, d, h, min);

describe("getDateFilterInputType", () => {
  it("picks datetime-local only for datetime columns", () => {
    expect(getDateFilterInputType("dateTime")).toBe("datetime-local");
    expect(getDateFilterInputType("dateTimeString")).toBe("datetime-local");
    expect(getDateFilterInputType("date")).toBe("date");
    expect(getDateFilterInputType("dateString")).toBe("date");
  });
});

describe("formatDateFilterInput", () => {
  it("formats in local time for each input type", () => {
    const date = local(2026, 1, 5, 23, 45);
    expect(formatDateFilterInput(date, "date")).toBe("2026-01-05");
    expect(formatDateFilterInput(date, "datetime-local")).toBe("2026-01-05T23:45");
  });

  it("keeps date-only strings on their calendar day", () => {
    expect(formatDateFilterInput("2026-01-05", "date")).toBe("2026-01-05");
    expect(formatDateFilterInput("2026-01-05", "datetime-local")).toBe("2026-01-05T00:00");
  });

  it("returns an empty string for missing or invalid values", () => {
    expect(formatDateFilterInput(undefined, "date")).toBe("");
    expect(formatDateFilterInput("nope", "datetime-local")).toBe("");
  });
});

describe("evaluateDateCondition with input strings", () => {
  it("date-only values cover the whole local day", () => {
    const evening = local(2026, 1, 15, 23, 30);
    expect(evaluateDateCondition(evening, dateOp("=", "2026-01-15"))).toBe(true);
    expect(evaluateDateCondition(evening, dateOp(">", "2026-01-15"))).toBe(false);
    expect(evaluateDateCondition(local(2026, 1, 16), dateOp(">", "2026-01-15"))).toBe(true);
    expect(evaluateDateCondition(evening, dateOp("<", "2026-01-15"))).toBe(false);
    expect(evaluateDateCondition(evening, dateOp("between", "2026-01-10", "2026-01-15"))).toBe(true);
    expect(evaluateDateCondition(local(2026, 1, 16), dateOp("between", "2026-01-10", "2026-01-15"))).toBe(false);
  });

  it("datetime values compare at minute precision", () => {
    const at = local(2026, 1, 15, 10, 30);
    expect(evaluateDateCondition(new Date(at.getTime() + 20_000), dateOp("=", "2026-01-15T10:30"))).toBe(true);
    expect(evaluateDateCondition(local(2026, 1, 15, 10, 31), dateOp("=", "2026-01-15T10:30"))).toBe(false);
    expect(evaluateDateCondition(local(2026, 1, 15, 10, 31), dateOp(">", "2026-01-15T10:30"))).toBe(true);
    expect(evaluateDateCondition(at, dateOp("<", "2026-01-15T10:30"))).toBe(false);
    expect(
      evaluateDateCondition(at, dateOp("between", "2026-01-15T09:00", "2026-01-15T10:30")),
    ).toBe(true);
  });

  it("reads date-only string cells as local days", () => {
    expect(evaluateDateCondition("2026-01-15", dateOp("=", "2026-01-15"))).toBe(true);
  });

  it("matches nothing when the filter value is invalid", () => {
    expect(evaluateDateCondition(local(2026, 1, 15), dateOp("=", "nope"))).toBe(false);
    expect(evaluateDateCondition(local(2026, 1, 15), dateOp("between", "2026-01-10"))).toBe(false);
  });
});
