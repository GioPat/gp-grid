// packages/core/src/grid-core-cells.ts
// `GridCore.cells`: cell values by position and cell geometry by identity.

import type { CellValue, RowId } from "./types";
import type { CellBounds, GeometrySpace, GridGeometry } from "./types/geometry";
import type { RowDataManager } from "./managers/row-data-manager";

export interface GridCellsApi {
  getValue(row: number, col: number): CellValue;
  setValue(row: number, col: number, value: CellValue): void;
  /**
   * Read a raw source field at a view row, independent of the displayed
   * columns, including for record-less (columnar) rows.
   */
  getFieldValue(viewIndex: number, field: string): CellValue;
  /** Resolve a cell to viewport/content geometry by identity. */
  getBounds(rowId: RowId, columnId: string, space?: GeometrySpace): CellBounds | undefined;
}

export interface CellsControllerDeps<TData> {
  rowData: RowDataManager<TData>;
  geometry: GridGeometry;
}

export class CellsController<TData> implements GridCellsApi {
  private readonly deps: CellsControllerDeps<TData>;

  constructor(deps: CellsControllerDeps<TData>) {
    this.deps = deps;
  }

  getValue(row: number, col: number): CellValue {
    return this.deps.rowData.getCellValue(row, col);
  }

  setValue(row: number, col: number, value: CellValue): void {
    this.deps.rowData.setCellValue(row, col, value);
  }

  getFieldValue(viewIndex: number, field: string): CellValue {
    return this.deps.rowData.getFieldValue(viewIndex, field);
  }

  getBounds(
    rowId: RowId,
    columnId: string,
    space: GeometrySpace = "viewport",
  ): CellBounds | undefined {
    const viewIndex = this.resolveViewIndex(rowId);
    if (viewIndex === undefined) return undefined;
    const { geometry } = this.deps;
    const layoutIndex = geometry
      .getColumnLayout()
      .columns.find((column) => column.columnId === columnId)?.layoutIndex;
    if (layoutIndex === undefined) return undefined;
    return geometry.getCellBounds(viewIndex, layoutIndex, space);
  }

  /**
   * Resolve a row identity without scanning a remote or columnar source:
   * the bounded current window is checked by id, then the resident records.
   */
  private resolveViewIndex(rowId: RowId): number | undefined {
    const { rowData, geometry } = this.deps;
    const window = geometry.getRowWindow();
    for (let viewIndex = window.start; viewIndex < window.end; viewIndex++) {
      if (rowData.getRowId(viewIndex) === rowId) return viewIndex;
    }
    const resident = rowData.findViewIndexById(rowId);
    return resident === -1 ? undefined : resident;
  }
}
