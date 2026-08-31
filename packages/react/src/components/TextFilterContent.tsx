import React, { useCallback, useMemo, useState } from "react";
import {
  formatLabel,
  getTextOperatorOptions,
  groupDistinctValues,
  isBlankCellValue,
  labelsForSelectedValues,
  rawValuesForLabels,
} from "@gp-grid/core";
import type {
  CellValue,
  ColumnFilterModel,
  FilterConditionGroup,
  GridLabels,
  TextFilterCondition,
  TextFilterOperator,
} from "@gp-grid/core";
import { FilterCombinationToggle } from "./FilterCombinationToggle";
import {
  useFilterGroups,
  type LocalFilterGroup,
} from "./useFilterGroups";

export interface TextFilterContentProps {
  distinctValues: CellValue[];
  valueFormatter?: (value: CellValue) => string;
  currentFilter?: ColumnFilterModel;
  labels: GridLabels;
  onApply: (filter: ColumnFilterModel | null) => void;
  onClose: () => void;
}

const MAX_VALUES_FOR_LIST = 100;

interface Condition {
  operator: TextFilterOperator;
  value: string;
}

type FilterMode = "values" | "condition";

const createCondition = (): Condition => ({
  operator: "contains",
  value: "",
});

const getFirstTextCondition = (
  filter: ColumnFilterModel | undefined,
): TextFilterCondition | undefined =>
  filter?.groups[0]?.conditions[0] as TextFilterCondition | undefined;

const initialGroupsFor = (
  filter: ColumnFilterModel | undefined,
): LocalFilterGroup<Condition>[] => {
  const firstCondition = getFirstTextCondition(filter);
  if (filter?.groups.length && firstCondition?.selectedValues === undefined) {
    return filter.groups.map((group) => ({
      combination: group.combination,
      conditions: group.conditions.map((condition) => {
        const textCondition = condition as TextFilterCondition;
        return {
          operator: textCondition.operator,
          value: textCondition.value ?? "",
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
  return condition.value.trim() !== "";
};

export function TextFilterContent({
  distinctValues,
  valueFormatter,
  currentFilter,
  labels,
  onApply,
}: TextFilterContentProps): React.ReactNode {
  const operators = useMemo(() => getTextOperatorOptions(labels), [labels]);
  const uniqueEntries = useMemo(
    () => groupDistinctValues(distinctValues, valueFormatter),
    [distinctValues, valueFormatter],
  );
  const hasTooManyValues = uniqueEntries.length > MAX_VALUES_FOR_LIST;
  const firstCondition = getFirstTextCondition(currentFilter);

  const initialMode = useMemo((): FilterMode => {
    if (firstCondition === undefined) {
      return hasTooManyValues ? "condition" : "values";
    }
    return firstCondition.selectedValues !== undefined ? "values" : "condition";
  }, [firstCondition, hasTooManyValues]);
  const [mode, setMode] = useState<FilterMode>(initialMode);

  const initialSelected = useMemo(() => {
    if (firstCondition?.selectedValues === undefined) return new Set<string>();
    return labelsForSelectedValues(uniqueEntries, firstCondition.selectedValues);
  }, [firstCondition, uniqueEntries]);
  const [searchText, setSearchText] = useState("");
  const [selectedLabels, setSelectedLabels] = useState(initialSelected);
  const [includeBlanks, setIncludeBlanks] = useState(
    firstCondition?.includeBlank ?? true,
  );

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

  const displayEntries = useMemo(() => {
    if (!searchText) return uniqueEntries;
    const normalizedSearch = searchText.toLowerCase();
    return uniqueEntries.filter((entry) =>
      entry.label.toLowerCase().includes(normalizedSearch));
  }, [searchText, uniqueEntries]);
  const hasBlanks = useMemo(
    () => distinctValues.some(isBlankCellValue),
    [distinctValues],
  );
  const allSelected = useMemo(() => {
    const allNonBlank = displayEntries.every((entry) =>
      selectedLabels.has(entry.label));
    return allNonBlank && (!hasBlanks || includeBlanks);
  }, [displayEntries, hasBlanks, includeBlanks, selectedLabels]);

  const handleSelectAll = useCallback(() => {
    setSelectedLabels(new Set(displayEntries.map((entry) => entry.label)));
    if (hasBlanks) setIncludeBlanks(true);
  }, [displayEntries, hasBlanks]);
  const handleDeselectAll = useCallback(() => {
    setSelectedLabels(new Set());
    setIncludeBlanks(false);
  }, []);
  const handleValueToggle = useCallback((label: string) => {
    setSelectedLabels((previous) => {
      const next = new Set(previous);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }, []);

  const handleApply = useCallback(() => {
    if (mode === "values") {
      const allNonBlankSelected = uniqueEntries.every((entry) =>
        selectedLabels.has(entry.label));
      const isAllSelected = allNonBlankSelected && (!hasBlanks || includeBlanks);
      if (isAllSelected) {
        onApply(null);
        return;
      }
      const condition: TextFilterCondition = {
        type: "text",
        operator: "equals",
        selectedValues: rawValuesForLabels(uniqueEntries, selectedLabels),
        includeBlank: includeBlanks,
      };
      onApply({
        groups: [{ conditions: [condition], combination: "and" }],
        combination: "and",
      });
      return;
    }

    const filterGroups: FilterConditionGroup[] = groups.flatMap((group) => {
      const validConditions = group.conditions.filter(isValidCondition);
      if (validConditions.length === 0) return [];
      const conditions: TextFilterCondition[] = validConditions.map((condition) => ({
        type: "text",
        operator: condition.operator,
        value: condition.value,
      }));
      return [{ conditions, combination: group.combination }];
    });
    if (filterGroups.length === 0) {
      onApply(null);
      return;
    }
    onApply({ groups: filterGroups, combination });
  }, [
    combination,
    groups,
    hasBlanks,
    includeBlanks,
    mode,
    onApply,
    selectedLabels,
    uniqueEntries,
  ]);

  const handleClear = useCallback(() => onApply(null), [onApply]);

  return (
    <div className="gp-grid-filter-content gp-grid-filter-text">
      {!hasTooManyValues && (
        <div className="gp-grid-filter-mode-toggle">
          <button
            type="button"
            className={mode === "values" ? "active" : ""}
            aria-pressed={mode === "values"}
            onClick={() => setMode("values")}
          >
            {labels.valuesMode}
          </button>
          <button
            type="button"
            className={mode === "condition" ? "active" : ""}
            aria-pressed={mode === "condition"}
            onClick={() => setMode("condition")}
          >
            {labels.conditionMode}
          </button>
        </div>
      )}
      {hasTooManyValues && mode === "condition" && (
        <div className="gp-grid-filter-info">
          {formatLabel(labels.tooManyValues, { count: uniqueEntries.length })}
        </div>
      )}

      {mode === "values" && (
        <>
          <input
            className="gp-grid-filter-search"
            type="text"
            placeholder={labels.searchPlaceholder}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            autoFocus
          />
          <div className="gp-grid-filter-actions">
            <button type="button" onClick={handleSelectAll} disabled={allSelected}>
              {labels.selectAll}
            </button>
            <button type="button" onClick={handleDeselectAll}>
              {labels.deselectAll}
            </button>
          </div>
          <div className="gp-grid-filter-list">
            {hasBlanks && (
              <label className="gp-grid-filter-option">
                <input
                  type="checkbox"
                  checked={includeBlanks}
                  onChange={() => setIncludeBlanks(!includeBlanks)}
                />
                <span className="gp-grid-filter-blank">{labels.blanks}</span>
              </label>
            )}
            {displayEntries.map((entry) => (
              <label key={entry.label} className="gp-grid-filter-option">
                <input
                  type="checkbox"
                  checked={selectedLabels.has(entry.label)}
                  onChange={() => handleValueToggle(entry.label)}
                />
                <span>{entry.label}</span>
              </label>
            ))}
          </div>
        </>
      )}

      {mode === "condition" && (
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
                          operator: event.target.value as TextFilterOperator,
                        })}
                        autoFocus={groupIndex === 0 && conditionIndex === 0}
                      >
                        {operators.map((operator) => (
                          <option key={operator.value} value={operator.value}>
                            {operator.label}
                          </option>
                        ))}
                      </select>
                      {condition.operator !== "blank" && condition.operator !== "notBlank" && (
                        <input
                          type="text"
                          value={condition.value}
                          onChange={(event) => updateCondition(groupIndex, conditionIndex, {
                            value: event.target.value,
                          })}
                          placeholder={labels.valuePlaceholder}
                          className="gp-grid-filter-text-input"
                        />
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
      )}

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
