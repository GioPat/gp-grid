// packages/react/src/components/CustomFilter.tsx

import React from "react";
import type { FilterClearParams, FilterRendererParams } from "@gp-grid/core";
import type { ReactFilterRenderer } from "../types";

interface CustomFilterProps {
  renderer: ReactFilterRenderer;
  params: FilterRendererParams;
}

/** Mounted as components so the renderers' hooks belong to them, not to the popup. */
const FilterContent = ({ renderer, params }: CustomFilterProps): React.ReactNode =>
  renderer.content(params);

const FilterClear = ({ renderer, params }: CustomFilterProps): React.ReactNode => {
  const clearParams: FilterClearParams = {
    clear: () => params.apply(null),
    hasFilter: params.currentFilter !== undefined,
    labels: params.labels,
  };
  const { clear } = renderer;
  if (clear === "default") {
    return (
      <button type="button" className="gp-grid-filter-btn-clear" onClick={clearParams.clear}>
        {params.labels.clear}
      </button>
    );
  }
  return clear?.(clearParams);
};

export const CustomFilter = (props: CustomFilterProps): React.ReactNode => (
  <>
    <FilterContent {...props} />
    {props.renderer.clear !== null && (
      <div className="gp-grid-filter-clear">
        <FilterClear {...props} />
      </div>
    )}
  </>
);
