// Provisional target vocabulary used to check planned API examples. These
// declarations stay local until their owning features export the contracts.
// Column identity, view-row, column-state, geometry and frozen-row contracts
// now come from the public package; row sizing remains provisional.
type RowId = string | number;

interface TargetOptions {
  rowHeight?: number | "auto" | ((rowId: RowId) => number);
}

declare const options: TargetOptions;

void options;
