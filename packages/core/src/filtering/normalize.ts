import type {
  ColumnFilterInput,
  ColumnFilterModel,
  FilterCombination,
  FilterCondition,
  FilterConditionGroup,
  LegacyColumnFilterModel,
  LegacyFilterCondition,
} from "../types";

interface NormalizationCandidate {
  model: ColumnFilterModel;
  conditionCount: number;
}

/** Check whether a filter still uses the legacy flat condition list. */
export const isLegacyColumnFilterModel = (
  filter: ColumnFilterInput,
): filter is LegacyColumnFilterModel => "conditions" in filter;

const withoutNextOperator = (
  condition: LegacyFilterCondition,
): FilterCondition => {
  const canonicalCondition = { ...condition };
  delete canonicalCondition.nextOperator;
  return canonicalCondition;
};

const buildCandidate = (
  conditions: FilterCondition[],
  operators: FilterCombination[],
  groupCombination: FilterCombination,
): NormalizationCandidate => {
  const modelCombination = groupCombination === "and" ? "or" : "and";
  let conditionGroups: FilterCondition[][] = [[conditions[0]!]];

  for (const [index, condition] of conditions.entries()) {
    if (index === 0) continue;
    const operator = operators[index - 1];
    if (operator === modelCombination) {
      conditionGroups.push([condition]);
      continue;
    }
    conditionGroups = conditionGroups.map((group) => [...group, condition]);
  }

  const groups: FilterConditionGroup[] = conditionGroups.map((group) => ({
    conditions: group,
    combination: groupCombination,
  }));
  const conditionCount = groups.reduce(
    (count, group) => count + group.conditions.length,
    0,
  );

  return {
    model: { groups, combination: modelCombination },
    conditionCount,
  };
};

const pickCompactCandidate = (
  dnf: NormalizationCandidate,
  cnf: NormalizationCandidate,
): ColumnFilterModel => {
  if (dnf.conditionCount < cnf.conditionCount) return dnf.model;
  if (cnf.conditionCount < dnf.conditionCount) return cnf.model;
  if (dnf.model.groups.length <= cnf.model.groups.length) return dnf.model;
  return cnf.model;
};

const normalizeLegacyFilter = (
  filter: LegacyColumnFilterModel,
): ColumnFilterModel => {
  if (filter.conditions.length === 0) {
    return { groups: [], combination: "and" };
  }

  const conditions = filter.conditions.map(withoutNextOperator);
  if (conditions.length === 1) {
    return {
      groups: [{ conditions, combination: "and" }],
      combination: "and",
    };
  }

  const operators = filter.conditions.slice(0, -1).map(
    (condition) => condition.nextOperator ?? filter.combination,
  );
  const dnf = buildCandidate(conditions, operators, "and");
  const cnf = buildCandidate(conditions, operators, "or");
  return pickCompactCandidate(dnf, cnf);
};

/**
 * Convert a legacy left-to-right filter into the canonical one-level grouped
 * representation. Canonical inputs are returned unchanged.
 */
export const normalizeColumnFilterModel = (
  filter: ColumnFilterInput,
): ColumnFilterModel => {
  if (isLegacyColumnFilterModel(filter)) return normalizeLegacyFilter(filter);
  return filter;
};
