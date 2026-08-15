// packages/react/src/components/DateFilterContent.tsx

import React, { useState, useCallback, useMemo } from "react";
import { getDateOperatorOptions } from "@gp-grid/core";
import type { ColumnFilterModel, DateFilterCondition, DateFilterOperator, GridLabels } from "@gp-grid/core";

export interface DateFilterContentProps {
  currentFilter?: ColumnFilterModel;
  labels: GridLabels;
  onApply: (filter: ColumnFilterModel | null) => void;
  onClose: () => void;
}

interface Condition {
  operator: DateFilterOperator;
  value: string;
  valueTo: string;
  nextOperator: "and" | "or";
}

// Convert Date to YYYY-MM-DD string for input
function formatDateForInput(date: Date | string | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0]!;
}

export function DateFilterContent({
  currentFilter,
  labels,
  onApply,
  onClose,
}: DateFilterContentProps): React.ReactNode {
  const operators = useMemo(() => getDateOperatorOptions(labels), [labels]);

  const initialConditions = useMemo((): Condition[] => {
    if (!currentFilter?.conditions.length) {
      return [{ operator: "=", value: "", valueTo: "", nextOperator: "and" }];
    }
    const defaultCombination = currentFilter.combination ?? "and";
    return currentFilter.conditions.map((c) => {
      const cond = c as DateFilterCondition;
      return {
        operator: cond.operator,
        value: formatDateForInput(cond.value),
        valueTo: formatDateForInput(cond.valueTo),
        nextOperator: cond.nextOperator ?? defaultCombination,
      };
    });
  }, [currentFilter]);

  const [conditions, setConditions] = useState<Condition[]>(initialConditions);

  const updateCondition = useCallback((index: number, updates: Partial<Condition>) => {
    setConditions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index]!, ...updates };
      return next;
    });
  }, []);

  const addCondition = useCallback(() => {
    setConditions((prev) => [...prev, { operator: "=", value: "", valueTo: "", nextOperator: "and" }]);
  }, []);

  const removeCondition = useCallback((index: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleApply = useCallback(() => {
    const validConditions = conditions.filter((c) => {
      if (c.operator === "blank" || c.operator === "notBlank") return true;
      if (c.operator === "between") {
        return c.value !== "" && c.valueTo !== "";
      }
      return c.value !== "";
    });

    if (validConditions.length === 0) {
      onApply(null);
      return;
    }

    const filter: ColumnFilterModel = {
      conditions: validConditions.map((c) => ({
        type: "date" as const,
        operator: c.operator,
        value: c.value || undefined,
        valueTo: c.valueTo || undefined,
        nextOperator: c.nextOperator,
      })),
      combination: "and", // Default combination for backwards compatibility
    };
    onApply(filter);
  }, [conditions, onApply]);

  const handleClear = useCallback(() => {
    onApply(null);
  }, [onApply]);

  return (
    <div className="gp-grid-filter-content gp-grid-filter-date">
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
              onChange={(e) => updateCondition(index, { operator: e.target.value as DateFilterOperator })}
            >
              {operators.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>

            {cond.operator !== "blank" && cond.operator !== "notBlank" && (
              <input
                type="date"
                value={cond.value}
                onChange={(e) => updateCondition(index, { value: e.target.value })}
              />
            )}

            {cond.operator === "between" && (
              <>
                <span className="gp-grid-filter-to">{labels.betweenSeparator}</span>
                <input
                  type="date"
                  value={cond.valueTo}
                  onChange={(e) => updateCondition(index, { valueTo: e.target.value })}
                />
              </>
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
