export interface GridOptions {
  rowCount: number;
  colCount: number;
  rowHeight: number;
  colWidth: number;
  getCellValue: (row: number, col: number) => string;
}

export interface CellInfo {
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
  value: string;
}

type RenderCallback = (cells: CellInfo[]) => void;

export class GridEngine {
  private opts: GridOptions;
  private renderCb?: RenderCallback;

  constructor(opts: GridOptions) {
    this.opts = opts;
  }

  onRender(cb: RenderCallback) {
    this.renderCb = cb;
  }

  /** Call on scroll to recompute visible cells */
  computeVisible(
    scrollTop: number,
    scrollLeft: number,
    viewportW: number,
    viewportH: number,
  ) {
    const { rowHeight, colWidth, rowCount, colCount, getCellValue } = this.opts;

    const startRow = Math.floor(scrollTop / rowHeight);
    const endRow = Math.min(
      rowCount,
      startRow + Math.ceil(viewportH / rowHeight) + 1,
    );

    const startCol = Math.floor(scrollLeft / colWidth);
    const endCol = Math.min(
      colCount,
      startCol + Math.ceil(viewportW / colWidth) + 1,
    );

    const cells: CellInfo[] = [];
    for (let r = startRow; r < endRow; r++) {
      for (let c = startCol; c < endCol; c++) {
        cells.push({
          row: r,
          col: c,
          x: c * colWidth,
          y: r * rowHeight,
          width: colWidth,
          height: rowHeight,
          value: getCellValue(r, c),
        });
      }
    }
    this.renderCb?.(cells);
  }

  get totalWidth() {
    return this.opts.colCount * this.opts.colWidth;
  }

  get totalHeight() {
    return this.opts.rowCount * this.opts.rowHeight;
  }
}
