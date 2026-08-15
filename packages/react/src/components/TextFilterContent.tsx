// packages/react/src/components/TextFilterContent.tsx

import React, { useState, useMemo, useCallback } from "react";
import type { CellValue, ColumnFilterModel, GridLabels, TextFilterCondition, TextFilterOperator } from "@gp-grid/core";
import { formatLabel, getTextOperatorOptions, groupDistinctValues, isBlankCellValue, labelsForSelectedValues, rawValuesForLabels } from "@gp-grid/core";

export interface TextFilterContentProps {
  distinctValues: CellValue[];
  valueFormatter?: (v: CellValue) => string;
  currentFilter?: ColumnFilterModel;
  labels: GridLabels;
  onApply: (filter: ColumnFilterModel | null) => void;
  onClose: () => void;
}

const MAX_VALUES_FOR_LIST = 100;

interface Condition {
  operator: TextFilterOperator;
  value: string;
  nextOperator: "and" | "or";
}

type FilterMode = "values" | "condition";

export function TextFilterContent({
  distinctValues,
  valueFormatter,
  currentFilter,
  labels,
  onApply,
  onClose,
}: TextFilterContentProps): React.ReactNode {
  const operators = useMemo(() => getTextOperatorOptions(labels), [labels]);

  // Checkbox rows: one entry per display label, carrying every raw value
  // that formats to it. The filter model stores the RAW values; labels only
  // exist inside this popup.
  const uniqueEntries = useMemo(
    () => groupDistinctValues(distinctValues, valueFormatter),
    [distinctValues, valueFormatter],
  );

  const hasTooManyValues = uniqueEntries.length > MAX_VALUES_FOR_LIST;

  // Detect current filter mode from existing filter
  const initialMode = useMemo((): FilterMode => {
    if (!currentFilter?.conditions[0]) {
      return hasTooManyValues ? "condition" : "values";
    }
    const cond = currentFilter.conditions[0] as TextFilterCondition;
    // If using selectedValues, it's values mode
    if (cond.selectedValues && cond.selectedValues.size > 0) {
      return "values";
    }
    return "condition";
  }, [currentFilter, hasTooManyValues]);

  const [mode, setMode] = useState<FilterMode>(initialMode);

  // ============= VALUES MODE STATE =============
  // Local checkbox state tracks LABELS; raw values are resolved on apply.
  const initialSelected = useMemo(() => {
    if (!currentFilter?.conditions[0]) return new Set<string>();
    const cond = currentFilter.conditions[0] as TextFilterCondition;
    if (!cond.selectedValues) return new Set<string>();
    return labelsForSelectedValues(uniqueEntries, cond.selectedValues);
  }, [currentFilter, uniqueEntries]);

  const initialIncludeBlanks = useMemo(() => {
    if (!currentFilter?.conditions[0]) return true;
    const cond = currentFilter.conditions[0] as TextFilterCondition;
    return cond.includeBlank ?? true;
  }, [currentFilter]);

  const [searchText, setSearchText] = useState("");
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(initialSelected);
  const [includeBlanks, setIncludeBlanks] = useState(initialIncludeBlanks);

  // ============= CONDITION MODE STATE =============
  const initialConditions = useMemo((): Condition[] => {
    if (!currentFilter?.conditions.length) {
      return [{ operator: "contains", value: "", nextOperator: "and" }];
    }
    // Check if it's condition mode (not selectedValues)
    const cond = currentFilter.conditions[0] as TextFilterCondition;
    if (cond.selectedValues && cond.selectedValues.size > 0) {
      return [{ operator: "contains", value: "", nextOperator: "and" }];
    }
    const defaultCombination = currentFilter.combination ?? "and";
    return currentFilter.conditions.map((c) => {
      const tc = c as TextFilterCondition;
      return {
        operator: tc.operator,
        value: tc.value ?? "",
        nextOperator: tc.nextOperator ?? defaultCombination,
      };
    });
  }, [currentFilter]);

  const [conditions, setConditions] = useState<Condition[]>(initialConditions);

  // ============= VALUES MODE LOGIC =============
  const displayEntries = useMemo(() => {
    if (!searchText) return uniqueEntries;
    const lower = searchText.toLowerCase();
    return uniqueEntries.filter((e) => e.label.toLowerCase().includes(lower));
  }, [uniqueEntries, searchText]);

  // Empty arrays count too (tags column with no tags), so the "(Blanks)"
  // opt-out renders whenever blank rows exist.
  const hasBlanks = useMemo(() => {
    return distinctValues.some(isBlankCellValue);
  }, [distinctValues]);

  const allSelected = useMemo(() => {
    const allNonBlank = displayEntries.every((e) => selectedLabels.has(e.label));
    return allNonBlank && (!hasBlanks || includeBlanks);
  }, [displayEntries, selectedLabels, hasBlanks, includeBlanks]);

  const handleSelectAll = useCallback(() => {
    setSelectedLabels(new Set(displayEntries.map((e) => e.label)));
    if (hasBlanks) setIncludeBlanks(true);
  }, [displayEntries, hasBlanks]);

  const handleDeselectAll = useCallback(() => {
    setSelectedLabels(new Set());
    setIncludeBlanks(false);
  }, []);

  const handleValueToggle = useCallback((label: string) => {
    setSelectedLabels((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }, []);

  // ============= CONDITION MODE LOGIC =============
  const updateCondition = useCallback((index: number, updates: Partial<Condition>) => {
    setConditions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index]!, ...updates };
      return next;
    });
  }, []);

  const addCondition = useCallback(() => {
    setConditions((prev) => [...prev, { operator: "contains", value: "", nextOperator: "and" }]);
  }, []);

  const removeCondition = useCallback((index: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ============= APPLY LOGIC =============
  const handleApply = useCallback(() => {
    if (mode === "values") {
      // Values mode - resolve ticked labels to their raw values
      const allNonBlankSelected = uniqueEntries.every((e) => selectedLabels.has(e.label));
      const isAllSelected = allNonBlankSelected && (!hasBlanks || includeBlanks);

      if (isAllSelected) {
        onApply(null);
        return;
      }

      const filter: ColumnFilterModel = {
        conditions: [
          {
            type: "text",
            operator: "equals",
            selectedValues: rawValuesForLabels(uniqueEntries, selectedLabels),
            includeBlank: includeBlanks,
          },
        ],
        combination: "and",
      };
      onApply(filter);
    } else {
      // Condition mode - use operators
      const validConditions = conditions.filter((c) => {
        if (c.operator === "blank" || c.operator === "notBlank") return true;
        return c.value.trim() !== "";
      });

      if (validConditions.length === 0) {
        onApply(null);
        return;
      }

      const filter: ColumnFilterModel = {
        conditions: validConditions.map((c) => ({
          type: "text" as const,
          operator: c.operator,
          value: c.value,
          nextOperator: c.nextOperator,
        })),
        combination: "and", // Default combination for backwards compatibility
      };
      onApply(filter);
    }
  }, [mode, uniqueEntries, selectedLabels, includeBlanks, hasBlanks, conditions, onApply]);

  const handleClear = useCallback(() => {
    onApply(null);
  }, [onApply]);

  return (
    <div className="gp-grid-filter-content gp-grid-filter-text">
      {/* Mode toggle - only show if not too many values */}
      {!hasTooManyValues && (
        <div className="gp-grid-filter-mode-toggle">
          <button
            type="button"
            className={mode === "values" ? "active" : ""}
            onClick={() => setMode("values")}
          >
            {labels.valuesMode}
          </button>
          <button
            type="button"
            className={mode === "condition" ? "active" : ""}
            onClick={() => setMode("condition")}
          >
            {labels.conditionMode}
          </button>
        </div>
      )}

      {/* Too many values message */}
      {hasTooManyValues && mode === "condition" && (
        <div className="gp-grid-filter-info">
          {formatLabel(labels.tooManyValues, { count: uniqueEntries.length })}
        </div>
      )}

      {/* VALUES MODE */}
      {mode === "values" && (
        <>
          {/* Search input */}
          <input
            className="gp-grid-filter-search"
            type="text"
            placeholder={labels.searchPlaceholder}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            autoFocus
          />

          {/* Select all / Deselect all */}
          <div className="gp-grid-filter-actions">
            <button type="button" onClick={handleSelectAll} disabled={allSelected}>
              {labels.selectAll}
            </button>
            <button type="button" onClick={handleDeselectAll}>
              {labels.deselectAll}
            </button>
          </div>

          {/* Checkbox list */}
          <div className="gp-grid-filter-list">
            {/* Blanks option */}
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

            {/* Values */}
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

      {/* CONDITION MODE */}
      {mode === "condition" && (
        <>
          {conditions.map((cond, index) => (
            <div key={index} className="gp-grid-filter-condition">
              {index > 0 && (
                <div className="gp-grid-filter-combination">
                  <button
                    type="button"
                    className={conditions[index - 1]?.nextOperator === "and" ? "active" : ""}
                    onClick={() => updateCondition(index - 1, { nextOperator: "and" })}
                  >
                    {labels.and}
                  </button>
                  <button
                    type="button"
                    className={conditions[index - 1]?.nextOperator === "or" ? "active" : ""}
                    onClick={() => updateCondition(index - 1, { nextOperator: "or" })}
                  >
                    {labels.or}
                  </button>
                </div>
              )}

              <div className="gp-grid-filter-row">
                <select
                  value={cond.operator}
                  onChange={(e) => updateCondition(index, { operator: e.target.value as TextFilterOperator })}
                  autoFocus={index === 0}
                >
                  {operators.map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>

                {cond.operator !== "blank" && cond.operator !== "notBlank" && (
                  <input
                    type="text"
                    value={cond.value}
                    onChange={(e) => updateCondition(index, { value: e.target.value })}
                    placeholder={labels.valuePlaceholder}
                    className="gp-grid-filter-text-input"
                  />
                )}

                {conditions.length > 1 && (
                  <button
                    type="button"
                    className="gp-grid-filter-remove"
                    onClick={() => removeCondition(index)}
                  >
                    {labels.removeCondition}
                  </button>
                )}
              </div>
            </div>
          ))}

          <button type="button" className="gp-grid-filter-add" onClick={addCondition}>
            {labels.addCondition}
          </button>
        </>
      )}

      {/* Apply / Clear buttons */}
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
