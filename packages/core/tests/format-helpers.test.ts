// packages/core/tests/format-helpers.test.ts

import { describe, it, expect } from "vitest";
import { formatCellValue } from "../src/utils/format-helpers";

describe("formatCellValue", () => {
  describe("without formatter", () => {
    it("returns empty string for null", () => {
      expect(formatCellValue(null)).toBe("");
    });

    it("returns the value unchanged for a non-empty string", () => {
      expect(formatCellValue("hello")).toBe("hello");
    });

    it("returns empty string for an empty string", () => {
      expect(formatCellValue("")).toBe("");
    });

    it("converts a number to string", () => {
      expect(formatCellValue(42)).toBe("42");
    });

    it("converts zero to string", () => {
      expect(formatCellValue(0)).toBe("0");
    });

    it("converts boolean true to string", () => {
      expect(formatCellValue(true)).toBe("true");
    });

    it("converts boolean false to string", () => {
      expect(formatCellValue(false)).toBe("false");
    });

    it("converts a Date using String()", () => {
      const date = new Date("2024-01-01T00:00:00.000Z");
      expect(formatCellValue(date)).toBe(String(date));
    });

    it("JSON-stringifies a plain object", () => {
      expect(formatCellValue({ a: 1, b: "x" })).toBe('{"a":1,"b":"x"}');
    });

    it("JSON-stringifies a nested plain object", () => {
      expect(formatCellValue({ a: { b: 2 } })).toBe('{"a":{"b":2}}');
    });

    it("JSON-stringifies an empty object", () => {
      expect(formatCellValue({})).toBe("{}");
    });

    it("joins an array of strings with ', '", () => {
      expect(formatCellValue(["a", "b", "c"])).toBe("a, b, c");
    });

    it("returns empty string for an empty array", () => {
      expect(formatCellValue([])).toBe("");
    });
  });

  describe("with valueFormatter", () => {
    it("applies the formatter to a plain object", () => {
      const formatter = (v: unknown) => (v as { name: string }).name;
      expect(formatCellValue({ name: "Alice", age: 30 }, formatter)).toBe("Alice");
    });

    it("short-circuits before the formatter for null values", () => {
      const formatter = () => "custom";
      expect(formatCellValue(null, formatter)).toBe("");
    });

    it("applies the formatter to a primitive value", () => {
      const formatter = (v: unknown) => `[${String(v)}]`;
      expect(formatCellValue("hello", formatter)).toBe("[hello]");
    });

    it("applies the formatter to a number", () => {
      const formatter = (v: unknown) => `$${String(v)}`;
      expect(formatCellValue(42, formatter)).toBe("$42");
    });
  });
});
