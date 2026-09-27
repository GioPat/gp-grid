// Provisional target vocabulary used to check planned API examples. These
// declarations stay local until their owning features export the contracts.
// Column identity, view-row, column-state, geometry, frozen-row and row-height
// contracts now come from the public package; auto sizing stays provisional.
type RowId = string | number;

interface TargetOptions {
  /** `"auto"` is PRD 007; a measured size has no function form. */
  rowHeight?: number | "auto";
}

declare const options: TargetOptions;

void options;
