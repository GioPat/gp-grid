// benchmarks/consumers/migration-guide.tsx
// The "after" snippets of docs/migration-1.0.md, type-checked against the built
// packages (pnpm --dir benchmarks typecheck:consumers). One block per guide section.

import { GridCore, createMutableClientDataSource, isCellSelected, readContainerBounds, toPointerEventData, isRowVisible, normalizeColumnFilterModel } from "@gp-grid/core";
import type { CellRange, ColumnDefinition, ColumnResizedEvent, ColumnSchemaResult, GridLabelOverrides, LegacyColumnFilterModel } from "@gp-grid/core";
import { Grid } from "@gp-grid/react";
import type { GridRef } from "@gp-grid/react";
import type { GpGridProps } from "@gp-grid/vue";
import { createGridData } from "@gp-grid/angular";
import { useRef, type ReactElement } from "react";

interface Person { id: number; city: string; amount: number }

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 80 },
  { field: "city", cellDataType: "text", width: 200 },
  { field: "amount", cellDataType: "number", width: 120 },
];
const source = createMutableClientDataSource<Person>([{ id: 1, city: "Rome", amount: 10 }], { getRowId: (row) => row.id });
const core = new GridCore<Person>({ columns, dataSource: source, rowHeight: 32 });

// 1. Packages and entries
export const selected = (range: CellRange | null): boolean => isCellSelected(0, 0, range);

// 2. GridCore namespaces
export const namespaces = (row: number, col: number): void => {
  core.rows.getCount();
  core.cells.setValue(row, col, 1);
  core.edit.start(row, col);
  core.geometry.getColumnLayout().totalWidth;
  core.geometry.getContentSize().height;
  core.geometry.getVisibleRowWindow();
};

// 3. Column definitions and column state
export const columnState = (): ColumnSchemaResult => {
  core.columns.setState([{ columnId: "city", width: 240 }]);
  core.columns.getState();
  return core.columns.resetState(["city"]);
};

// 4. Events carry identity (React, Angular)
const persist = (columnId: string, width: number, viewIndex: number): void => void [columnId, width, viewIndex];
export const ReactEvents = (): ReactElement => {
  const gridRef = useRef<GridRef<Person> | null>(null);
  return (
    <Grid
      gridRef={gridRef}
      columns={columns}
      dataSource={source}
      rowHeight={32}
      columnState={[{ columnId: "city", width: 240 }]}
      onColumnResized={({ columnId, width, viewIndex }) => persist(columnId, width, viewIndex)}
      onColumnMoved={({ columnId, fromViewIndex, toViewIndex }) => void [columnId, fromViewIndex, toViewIndex]}
      onRowDragEnd={({ rowId, fromViewIndex, toViewIndex }) => void [rowId, fromViewIndex, toViewIndex]}
    />
  );
};
export class AngularEvents {
  protected readonly grid = createGridData<Person>([{ id: 1, city: "Rome", amount: 10 }], { getRowId: (row) => row.id });
  onResized(event: ColumnResizedEvent): void {
    persist(event.columnId, event.width, event.viewIndex);
  }
}
export const vueProps: GpGridProps<Person> = {
  columns,
  dataSource: source,
  rowHeight: 32,
  columnState: [{ columnId: "city", width: 240 }],
  onColumnResized: ({ columnId, width, viewIndex }) => persist(columnId, width, viewIndex),
};

// 6. Geometry is core-owned
export const geometry = (rowIndex: number, layoutIndex: number, event: PointerEvent, bodyElement: HTMLElement): void => {
  for (const column of core.geometry.getColumnLayout().columns) void [column.offset, column.width];
  core.geometry.getCellBounds(rowIndex, layoutIndex, "viewport");
  core.geometry.hitTest({ x: 0, y: 0 });
  core.geometry.getScrollTarget(rowIndex, layoutIndex);
  core.input.handleDragMove(toPointerEventData(event), readContainerBounds(bodyElement));
};

// 8. Frozen rows
export const frozen = (): number => {
  core.frozenRows.set({ count: 2 });
  isRowVisible(1, { start: 5, end: 10 }, core.frozenRows.get().effectiveCount);
  return core.frozenRows.get().effectiveCount;
};

// 9. Labels
export const labels: GridLabelOverrides = { rowGroups: { grandTotal: "Totale" } };

// 10. Hierarchies
export const record = (i: number): Person | undefined => {
  const row = core.rows.getViewRow(i);
  return row?.kind === "record" ? row.record : undefined;
};

// 12. Transactions and refresh
export const refreshNow = async (): Promise<void> => {
  source.updateCell(1, "amount", 99);
  await source.flushTransactions();
  await core.refresh();
};

// 13. Filters
export const normalized = (legacy: LegacyColumnFilterModel) => normalizeColumnFilterModel(legacy);
