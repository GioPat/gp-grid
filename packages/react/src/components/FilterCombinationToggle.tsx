import React from "react";
import type { FilterCombination, GridLabels } from "@gp-grid/core";

interface FilterCombinationToggleProps {
  value: FilterCombination;
  labels: GridLabels;
  onChange: (value: FilterCombination) => void;
}

export const FilterCombinationToggle = ({
  value,
  labels,
  onChange,
}: FilterCombinationToggleProps): React.ReactNode => (
  <div className="gp-grid-filter-combination">
    <button
      type="button"
      className={value === "and" ? "active" : ""}
      aria-pressed={value === "and"}
      onClick={() => onChange("and")}
    >
      {labels.and}
    </button>
    <button
      type="button"
      className={value === "or" ? "active" : ""}
      aria-pressed={value === "or"}
      onClick={() => onChange("or")}
    >
      {labels.or}
    </button>
  </div>
);
