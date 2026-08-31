import { describe, expect, it } from "vitest";
import {
  isLegacyColumnFilterModel,
  normalizeColumnFilterModel,
} from "../src/filtering/normalize";
import { SortFilterManager } from "../src/managers/sort-filter-manager";
import type {
  ColumnDefinition,
  ColumnFilterModel,
  LegacyColumnFilterModel,
  LegacyFilterCondition,
} from "../src/types";

const textCondition = (
  value: string,
  nextOperator?: "and" | "or",
): LegacyFilterCondition => ({
  type: "text",
  operator: "contains",
  value,
  nextOperator,
});

const conditionValues = (
  groups: ReturnType<typeof normalizeColumnFilterModel>["groups"],
): string[][] => groups.map((group) => group.conditions.map((condition) =>
  condition.type === "text" ? condition.value ?? "" : ""));

describe("normalizeColumnFilterModel", () => {
  it("keeps canonical grouped models unchanged", () => {
    const canonical: ColumnFilterModel = {
      groups: [{
        conditions: [{ type: "text", operator: "contains", value: "a" }],
        combination: "and",
      }],
      combination: "and",
    };
    expect(isLegacyColumnFilterModel(canonical)).toBe(false);
    expect(normalizeColumnFilterModel(canonical)).toBe(canonical);
  });

  it("normalizes A AND B OR C to (A AND B) OR C", () => {
    const legacy: LegacyColumnFilterModel = {
      conditions: [
        textCondition("a", "and"),
        textCondition("b", "or"),
        textCondition("c"),
      ],
      combination: "and",
    };
    const normalized = normalizeColumnFilterModel(legacy);

    expect(normalized.combination).toBe("or");
    expect(normalized.groups.map((group) => group.combination)).toEqual([
      "and",
      "and",
    ]);
    expect(conditionValues(normalized.groups)).toEqual([["a", "b"], ["c"]]);
  });

  it("normalizes A OR B AND C to (A OR B) AND C", () => {
    const legacy: LegacyColumnFilterModel = {
      conditions: [
        textCondition("a", "or"),
        textCondition("b", "and"),
        textCondition("c"),
      ],
      combination: "or",
    };
    const normalized = normalizeColumnFilterModel(legacy);

    expect(normalized.combination).toBe("and");
    expect(normalized.groups.map((group) => group.combination)).toEqual([
      "or",
      "or",
    ]);
    expect(conditionValues(normalized.groups)).toEqual([["a", "b"], ["c"]]);
  });

  it("uses the legacy global combination when a link has no nextOperator", () => {
    const normalized = normalizeColumnFilterModel({
      conditions: [textCondition("a"), textCondition("b")],
      combination: "or",
    });

    expect(normalized.groups).toHaveLength(1);
    expect(normalized.groups[0]?.combination).toBe("or");
    expect(conditionValues(normalized.groups)).toEqual([["a", "b"]]);
  });

  it("chooses the exact candidate with fewer groups after condition-count ties", () => {
    const normalized = normalizeColumnFilterModel({
      conditions: [
        textCondition("a", "or"),
        textCondition("b", "and"),
        textCondition("c", "or"),
        textCondition("d"),
      ],
      combination: "and",
    });

    expect(normalized.combination).toBe("and");
    expect(conditionValues(normalized.groups)).toEqual([
      ["a", "b", "d"],
      ["c", "d"],
    ]);
  });

  it("removes legacy nextOperator properties from canonical output", () => {
    const normalized = normalizeColumnFilterModel({
      conditions: [textCondition("a", "or"), textCondition("b")],
      combination: "and",
    });
    for (const group of normalized.groups) {
      for (const condition of group.conditions) {
        expect("nextOperator" in condition).toBe(false);
      }
    }
  });
});

describe("SortFilterManager legacy input", () => {
  it("stores and exposes only the canonical grouped model", async () => {
    const columns: ColumnDefinition[] = [
      { field: "name", cellDataType: "text", width: 100 },
    ];
    const manager = new SortFilterManager({
      getColumns: () => columns,
      isSortingEnabled: () => true,
      getCachedRows: () => new Map(),
      onSortFilterChange: async () => {},
      onDataRefreshed: () => {},
    });

    await manager.setFilter("name", {
      conditions: [textCondition("a", "and"), textCondition("b")],
      combination: "or",
    });

    expect(manager.getFilterModel()["name"]).toEqual({
      groups: [{
        conditions: [
          { type: "text", operator: "contains", value: "a" },
          { type: "text", operator: "contains", value: "b" },
        ],
        combination: "and",
      }],
      combination: "or",
    });
  });
});
