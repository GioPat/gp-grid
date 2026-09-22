// Provisional target vocabulary used to check planned API examples. These
// declarations stay local until their owning features export the contracts.
// Column identity, view-row, column-state and geometry contracts now come from
// the public package; row-sizing remains provisional.
type RowId = string | number;

interface TargetOptions {
  freezeRows?: { count: number; includeHeader: boolean };
  rowHeight?: number | "auto" | ((rowId: RowId) => number);
}

declare const options: TargetOptions;

void options;
