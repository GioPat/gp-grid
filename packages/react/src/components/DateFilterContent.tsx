// packages/react/src/components/DateFilterContent.tsx

import React, { useState, useCallback, useMemo } from "react";
import type { ColumnFilterModel, DateFilterCondition, DateFilterOperator } from "gp-grid-core";

export interface DateFilterContentProps {
  currentFilter?: ColumnFilterModel;
  onApply: (filter: ColumnFilterModel | null) => void;
  onClose: () => void;
}

const OPERATORS: { value: DateFilterOperator; label: string }[] = [
  { value: "=", label: "=" },
  { value: "!=", label: "\u2260" },
  { value: ">", label: ">" },
  { value: "<", label: "<" },
  { value: "between", label: "\u2194" },
  { value: "blank", label: "Is blank" },
  { value: "notBlank", label: "Not blank" },
];

interface Condition {
  operator: DateFilterOperator;
  value: string;
  valueTo: string;
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
  onApply,
  onClose,
}: DateFilterContentProps): React.ReactNode {
  const initialConditions = useMemo((): Condition[] => {
    if (!currentFilter?.conditions.length) {
      return [{ operator: "=", value: "", valueTo: "" }];
    }
    return currentFilter.conditions.map((c) => {
      const cond = c as DateFilterCondition;
      return {
        operator: cond.operator,
        value: formatDateForInput(cond.value),
        valueTo: formatDateForInput(cond.valueTo),
      };
    });
  }, [currentFilter]);

  const initialCombination = currentFilter?.combination ?? "and";

  const [conditions, setConditions] = useState<Condition[]>(initialConditions);
  const [combination, setCombination] = useState<"and" | "or">(initialCombination);

  const updateCondition = useCallback((index: number, updates: Partial<Condition>) => {
    setConditions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index]!, ...updates };
      return next;
    });
  }, []);

  const addCondition = useCallback(() => {
    setConditions((prev) => [...prev, { operator: "=", value: "", valueTo: "" }]);
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
      })),
      combination,
    };
    onApply(filter);
  }, [conditions, combination, onApply]);

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
              onChange={(e) => updateCondition(index, { operator: e.target.value as DateFilterOperator })}
            >
              {OPERATORS.map((op) => (
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
                <span className="gp-grid-filter-to">to</span>
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
                ×
              </button>
            )}
          </div>
        </div>
      ))}

      <button type="button" className="gp-grid-filter-add" onClick={addCondition}>
        + Add condition
      </button>

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
