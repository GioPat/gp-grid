// packages/react/src/components/TextFilterContent.tsx

import React, { useState, useMemo, useCallback } from "react";
import type { CellValue, ColumnFilterModel, TextFilterCondition, TextFilterOperator } from "gp-grid-core";

export interface TextFilterContentProps {
  distinctValues: CellValue[];
  currentFilter?: ColumnFilterModel;
  onApply: (filter: ColumnFilterModel | null) => void;
  onClose: () => void;
}

const MAX_VALUES_FOR_LIST = 100;

const OPERATORS: { value: TextFilterOperator; label: string }[] = [
  { value: "contains", label: "Contains" },
  { value: "notContains", label: "Does not contain" },
  { value: "equals", label: "Equals" },
  { value: "notEquals", label: "Does not equal" },
  { value: "startsWith", label: "Starts with" },
  { value: "endsWith", label: "Ends with" },
  { value: "blank", label: "Is blank" },
  { value: "notBlank", label: "Is not blank" },
];

interface Condition {
  operator: TextFilterOperator;
  value: string;
}

type FilterMode = "values" | "condition";

export function TextFilterContent({
  distinctValues,
  currentFilter,
  onApply,
  onClose,
}: TextFilterContentProps): React.ReactNode {
  // Determine if we should use values mode or condition mode
  const uniqueValues = useMemo(() => {
    const values = distinctValues
      .filter((v) => v != null && v !== "")
      .map((v) => String(v));
    return Array.from(new Set(values)).sort();
  }, [distinctValues]);

  const hasTooManyValues = uniqueValues.length > MAX_VALUES_FOR_LIST;

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
  const initialSelected = useMemo(() => {
    if (!currentFilter?.conditions[0]) return new Set<string>();
    const cond = currentFilter.conditions[0] as TextFilterCondition;
    return cond.selectedValues ?? new Set<string>();
  }, [currentFilter]);

  const initialIncludeBlanks = useMemo(() => {
    if (!currentFilter?.conditions[0]) return true;
    const cond = currentFilter.conditions[0] as TextFilterCondition;
    return cond.includeBlank ?? true;
  }, [currentFilter]);

  const [searchText, setSearchText] = useState("");
  const [selectedValues, setSelectedValues] = useState<Set<string>>(initialSelected);
  const [includeBlanks, setIncludeBlanks] = useState(initialIncludeBlanks);

  // ============= CONDITION MODE STATE =============
  const initialConditions = useMemo((): Condition[] => {
    if (!currentFilter?.conditions.length) {
      return [{ operator: "contains", value: "" }];
    }
    // Check if it's condition mode (not selectedValues)
    const cond = currentFilter.conditions[0] as TextFilterCondition;
    if (cond.selectedValues && cond.selectedValues.size > 0) {
      return [{ operator: "contains", value: "" }];
    }
    return currentFilter.conditions.map((c) => {
      const tc = c as TextFilterCondition;
      return {
        operator: tc.operator,
        value: tc.value ?? "",
      };
    });
  }, [currentFilter]);

  const initialCombination = currentFilter?.combination ?? "and";

  const [conditions, setConditions] = useState<Condition[]>(initialConditions);
  const [combination, setCombination] = useState<"and" | "or">(initialCombination);

  // ============= VALUES MODE LOGIC =============
  const displayValues = useMemo(() => {
    if (!searchText) return uniqueValues;
    const lower = searchText.toLowerCase();
    return uniqueValues.filter((v) => v.toLowerCase().includes(lower));
  }, [uniqueValues, searchText]);

  const hasBlanks = useMemo(() => {
    return distinctValues.some((v) => v == null || v === "");
  }, [distinctValues]);

  const allSelected = useMemo(() => {
    const allNonBlank = displayValues.every((v) => selectedValues.has(v));
    return allNonBlank && (!hasBlanks || includeBlanks);
  }, [displayValues, selectedValues, hasBlanks, includeBlanks]);

  const handleSelectAll = useCallback(() => {
    setSelectedValues(new Set(displayValues));
    if (hasBlanks) setIncludeBlanks(true);
  }, [displayValues, hasBlanks]);

  const handleDeselectAll = useCallback(() => {
    setSelectedValues(new Set());
    setIncludeBlanks(false);
  }, []);

  const handleValueToggle = useCallback((value: string) => {
    setSelectedValues((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
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
    setConditions((prev) => [...prev, { operator: "contains", value: "" }]);
  }, []);

  const removeCondition = useCallback((index: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ============= APPLY LOGIC =============
  const handleApply = useCallback(() => {
    if (mode === "values") {
      // Values mode - use selectedValues
      const allNonBlankSelected = uniqueValues.every((v) => selectedValues.has(v));
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
            selectedValues: selectedValues,
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
        })),
        combination,
      };
      onApply(filter);
    }
  }, [mode, uniqueValues, selectedValues, includeBlanks, hasBlanks, conditions, combination, onApply]);

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
            Values
          </button>
          <button
            type="button"
            className={mode === "condition" ? "active" : ""}
            onClick={() => setMode("condition")}
          >
            Condition
          </button>
        </div>
      )}

      {/* Too many values message */}
      {hasTooManyValues && mode === "condition" && (
        <div className="gp-grid-filter-info">
          Too many unique values ({uniqueValues.length}). Use conditions to filter.
        </div>
      )}

      {/* VALUES MODE */}
      {mode === "values" && (
        <>
          {/* Search input */}
          <input
            className="gp-grid-filter-search"
            type="text"
            placeholder="Search..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            autoFocus
          />

          {/* Select all / Deselect all */}
          <div className="gp-grid-filter-actions">
            <button type="button" onClick={handleSelectAll} disabled={allSelected}>
              Select All
            </button>
            <button type="button" onClick={handleDeselectAll}>
              Deselect All
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
                <span className="gp-grid-filter-blank">(Blanks)</span>
              </label>
            )}

            {/* Values */}
            {displayValues.map((value) => (
              <label key={value} className="gp-grid-filter-option">
                <input
                  type="checkbox"
                  checked={selectedValues.has(value)}
                  onChange={() => handleValueToggle(value)}
                />
                <span>{value}</span>
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
                    className={combination === "and" ? "active" : ""}
                    onClick={() => setCombination("and")}
                  >
                    AND
                  </button>
                  <button
                    type="button"
                    className={combination === "or" ? "active" : ""}
                    onClick={() => setCombination("or")}
                  >
                    OR
                  </button>
                </div>
              )}

              <div className="gp-grid-filter-row">
                <select
                  value={cond.operator}
                  onChange={(e) => updateCondition(index, { operator: e.target.value as TextFilterOperator })}
                  autoFocus={index === 0}
                >
                  {OPERATORS.map((op) => (
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
                    placeholder="Value"
                    className="gp-grid-filter-text-input"
                  />
                )}

                {conditions.length > 1 && (
                  <button
                    type="button"
                    className="gp-grid-filter-remove"
                    onClick={() => removeCondition(index)}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}

          <button type="button" className="gp-grid-filter-add" onClick={addCondition}>
            + Add condition
          </button>
        </>
      )}

      {/* Apply / Clear buttons */}
      <div className="gp-grid-filter-buttons">
        <button type="button" className="gp-grid-filter-btn-clear" onClick={handleClear}>
          Clear
        </button>
        <button type="button" className="gp-grid-filter-btn-apply" onClick={handleApply}>
          Apply
        </button>
      </div>
    </div>
  );
}
