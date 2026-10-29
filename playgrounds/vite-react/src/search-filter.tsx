import { useState } from "react";
import type { ColumnFilterModel, FilterRendererParams } from "@gp-grid/react";

const containsFilter = (value: string): ColumnFilterModel | null => {
  if (value.trim() === "") return null;
  return {
    groups: [{ conditions: [{ type: "text", operator: "contains", value }], combination: "and" }],
    combination: "and",
  };
};

const currentSearch = (filter?: ColumnFilterModel): string => {
  const condition = filter?.groups[0]?.conditions[0];
  return condition?.type === "text" ? condition.value ?? "" : "";
};

/** Search box, cancel and apply only: replaces the built-in filter popup content. */
export const SearchFilter = ({ apply, close, currentFilter, labels }: FilterRendererParams) => {
  const [text, setText] = useState(() => currentSearch(currentFilter));
  return (
    <div className="gp-grid-filter-content">
      <input
        className="gp-grid-filter-search"
        data-testid="custom-filter-input"
        placeholder={labels.searchPlaceholder}
        value={text}
        autoFocus
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && apply(containsFilter(text))}
      />
      <div className="gp-grid-filter-buttons">
        <button type="button" data-testid="custom-filter-cancel" onClick={close}>Cancel</button>
        <button
          type="button"
          className="gp-grid-filter-btn-apply"
          data-testid="custom-filter-apply"
          onClick={() => apply(containsFilter(text))}
        >
          {labels.apply}
        </button>
      </div>
    </div>
  );
};
