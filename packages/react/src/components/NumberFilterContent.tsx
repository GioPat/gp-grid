import React, { useCallback, useMemo } from "react";
import { getNumberOperatorOptions } from "@gp-grid/core";
import type {
  ColumnFilterModel,
  FilterConditionGroup,
  GridLabels,
  NumberFilterCondition,
  NumberFilterOperator,
} from "@gp-grid/core";
import { FilterCombinationToggle } from "./FilterCombinationToggle";
import {
  useFilterGroups,
  type LocalFilterGroup,
} from "./useFilterGroups";

export interface NumberFilterContentProps {
  currentFilter?: ColumnFilterModel;
  labels: GridLabels;
  onApply: (filter: ColumnFilterModel | null) => void;
  onClose: () => void;
}

interface Condition {
  operator: NumberFilterOperator;
  value: string;
  valueTo: string;
}

const createCondition = (): Condition => ({
  operator: "=",
  value: "",
  valueTo: "",
});

const initialGroupsFor = (
  filter: ColumnFilterModel | undefined,
): LocalFilterGroup<Condition>[] => {
  if (filter?.groups.length) {
    return filter.groups.map((group) => ({
      combination: group.combination,
      conditions: group.conditions.map((condition) => {
        const numberCondition = condition as NumberFilterCondition;
        return {
          operator: numberCondition.operator,
          value: numberCondition.value != null
            ? String(numberCondition.value)
            : "",
          valueTo: numberCondition.valueTo != null
            ? String(numberCondition.valueTo)
            : "",
        };
      }),
    }));
  }
  return [{ conditions: [createCondition()], combination: "and" }];
};

const isValidCondition = (condition: Condition): boolean => {
  if (condition.operator === "blank" || condition.operator === "notBlank") {
    return true;
  }
  if (condition.operator === "between") {
    return condition.value !== "" && condition.valueTo !== "";
  }
  return condition.value !== "";
};

export function NumberFilterContent({
  currentFilter,
  labels,
  onApply,
}: NumberFilterContentProps): React.ReactNode {
  const operators = useMemo(() => getNumberOperatorOptions(labels), [labels]);
  const initialGroups = useMemo(
    () => initialGroupsFor(currentFilter),
    [currentFilter],
  );
  const {
    groups,
    combination,
    setCombination,
    setGroupCombination,
    updateCondition,
    addCondition,
    removeCondition,
    addGroup,
    removeGroup,
  } = useFilterGroups(
    initialGroups,
    currentFilter?.combination ?? "and",
    createCondition,
  );

  const handleApply = useCallback(() => {
    const filterGroups: FilterConditionGroup[] = groups.flatMap((group) => {
      const validConditions = group.conditions.filter(isValidCondition);
      if (validConditions.length === 0) return [];
      const conditions: NumberFilterCondition[] = validConditions.map((condition) => ({
        type: "number",
        operator: condition.operator,
        value: condition.value ? Number.parseFloat(condition.value) : undefined,
        valueTo: condition.valueTo
          ? Number.parseFloat(condition.valueTo)
          : undefined,
      }));
      return [{ conditions, combination: group.combination }];
    });

    if (filterGroups.length === 0) {
      onApply(null);
      return;
    }
    onApply({ groups: filterGroups, combination });
  }, [combination, groups, onApply]);

  const handleClear = useCallback(() => onApply(null), [onApply]);

  return (
    <div className="gp-grid-filter-content gp-grid-filter-number">
      <div className="gp-grid-filter-groups">
        {groups.length > 1 && (
          <FilterCombinationToggle
            value={combination}
            labels={labels}
            onChange={setCombination}
          />
        )}
        {groups.map((group, groupIndex) => (
          <div key={groupIndex} className="gp-grid-filter-group">
            {(group.conditions.length > 1 || groups.length > 1) && (
              <div className="gp-grid-filter-group-actions">
                {group.conditions.length > 1 && (
                  <FilterCombinationToggle
                    value={group.combination}
                    labels={labels}
                    onChange={(value) => setGroupCombination(groupIndex, value)}
                  />
                )}
                {groups.length > 1 && (
                  <button
                    type="button"
                    className="gp-grid-filter-remove gp-grid-filter-group-remove"
                    onClick={() => removeGroup(groupIndex)}
                  >
                    {labels.removeGroup}
                  </button>
                )}
              </div>
            )}
            {group.conditions.map((condition, conditionIndex) => (
              <div key={conditionIndex} className="gp-grid-filter-condition">
                  <div className="gp-grid-filter-row">
                    <select
                      value={condition.operator}
                      onChange={(event) => updateCondition(groupIndex, conditionIndex, {
                        operator: event.target.value as NumberFilterOperator,
                      })}
                    >
                      {operators.map((operator) => (
                        <option key={operator.value} value={operator.value}>
                          {operator.label}
                        </option>
                      ))}
                    </select>
                    {condition.operator !== "blank" && condition.operator !== "notBlank" && (
                      <input
                        type="number"
                        value={condition.value}
                        onChange={(event) => updateCondition(groupIndex, conditionIndex, {
                          value: event.target.value,
                        })}
                        placeholder={labels.valuePlaceholder}
                      />
                    )}
                    {condition.operator === "between" && (
                      <>
                        <span className="gp-grid-filter-to">{labels.betweenSeparator}</span>
                        <input
                          type="number"
                          value={condition.valueTo}
                          onChange={(event) => updateCondition(groupIndex, conditionIndex, {
                            valueTo: event.target.value,
                          })}
                          placeholder={labels.valuePlaceholder}
                        />
                      </>
                    )}
                    {group.conditions.length > 1 && (
                      <button
                        type="button"
                        className="gp-grid-filter-remove"
                        onClick={() => removeCondition(groupIndex, conditionIndex)}
                      >
                        {labels.removeCondition}
                      </button>
                    )}
                  </div>
              </div>
            ))}
            <button
              type="button"
              className="gp-grid-filter-add"
              onClick={() => addCondition(groupIndex)}
            >
              {labels.addCondition}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="gp-grid-filter-add gp-grid-filter-add-group"
          onClick={addGroup}
        >
          {labels.addGroup}
        </button>
      </div>
      <div className="gp-grid-filter-buttons">
        <button type="button" className="gp-grid-filter-btn-clear" onClick={handleClear}>
          {labels.clear}
        </button>
        <button type="button" className="gp-grid-filter-btn-apply" onClick={handleApply}>
          {labels.apply}
        </button>
      </div>
    </div>
  );
}
