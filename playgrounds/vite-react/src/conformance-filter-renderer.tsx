import { useState } from "react";
import type { ColumnFilterModel, FilterRendererParams, ReactFilterRenderer } from "@gp-grid/react";

const containsFilter = (value: string): ColumnFilterModel => ({
  groups: [{ conditions: [{ type: "text", operator: "contains", value }], combination: "and" }],
  combination: "and",
});

const SearchOnlyFilter = ({ apply, close }: FilterRendererParams) => {
  const [text, setText] = useState("");
  return (
    <div className="gp-grid-filter-content">
      <input data-testid="custom-filter-input" value={text} onChange={(event) => setText(event.target.value)} />
      <button type="button" data-testid="custom-filter-cancel" onClick={close}>Cancel</button>
      <button type="button" data-testid="custom-filter-apply" onClick={() => apply(containsFilter(text))}>Apply</button>
    </div>
  );
};

export const FILTER_RENDERERS: Record<string, ReactFilterRenderer> = { searchOnly: SearchOnlyFilter };
