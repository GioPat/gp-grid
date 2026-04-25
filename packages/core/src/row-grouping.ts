import type { CellValue, ColumnDefinition, RowGroupingOptions } from "./types";
import { getFieldValue } from "./utils";

export interface DataPresentationRow<TData = unknown> {
  kind: "data";
  rowIndex: number;
  rowData: TData;
}

export interface GroupPresentationRow {
  kind: "group";
  groupKey: string;
  depth: number;
  field: string;
  value: CellValue;
  childCount: number;
  expanded: boolean;
}

export type PresentationRow<TData = unknown> =
  | DataPresentationRow<TData>
  | GroupPresentationRow;

interface GroupNode<TData> {
  key: string;
  depth: number;
  field: string;
  value: CellValue;
  rows: Array<{ rowIndex: number; rowData: TData }>;
  children: Map<string, GroupNode<TData>>;
}

export interface RowGroupingManagerOptions<TData> {
  getColumns: () => ColumnDefinition[];
  getCachedRows: () => Map<number, TData>;
  getTotalRows: () => number;
  onExpandedChange?: (groupKey: string, expanded: boolean) => void;
}

export class RowGroupingManager<TData = unknown> {
  private options: RowGroupingManagerOptions<TData>;
  private grouping: RowGroupingOptions | undefined;
  private expansionOverrides = new Map<string, boolean>();
  private presentationRows: PresentationRow<TData>[] = [];
  private root: GroupNode<TData> | null = null;

  constructor(options: RowGroupingManagerOptions<TData>, grouping?: RowGroupingOptions) {
    this.options = options;
    this.setGrouping(grouping);
  }

  setGrouping(grouping: RowGroupingOptions | undefined): void {
    this.grouping = normalizeGrouping(grouping);
    this.expansionOverrides = new Map(
      (this.grouping?.expandedGroups ?? []).map((groupKey) => [groupKey, true]),
    );
    this.rebuild();
  }

  rebuild(): void {
    const grouping = this.grouping;
    if (!grouping || grouping.columns.length === 0) {
      this.root = null;
      this.presentationRows = this.buildFlatRows();
      return;
    }

    this.root = this.buildTree(grouping.columns);
    this.flattenTree();
  }

  private flattenTree(): void {
    const grouping = this.grouping;
    const root = this.root;
    if (!grouping || !root) return;

    const rows: PresentationRow<TData>[] = [];
    for (const node of root.children.values()) {
      this.flattenNode(node, rows, grouping);
    }
    this.presentationRows = rows;
  }

  getRows(): PresentationRow<TData>[] {
    return this.presentationRows;
  }

  getRow(index: number): PresentationRow<TData> | undefined {
    return this.presentationRows[index];
  }

  getRowCount(): number {
    return this.presentationRows.length;
  }

  isGroupingActive(): boolean {
    return this.grouping !== undefined && this.grouping.columns.length > 0;
  }

  toggle(groupKey: string): boolean {
    const current = this.isGroupExpanded(groupKey);
    const expanded = !current;
    this.expansionOverrides.set(groupKey, expanded);
    this.flattenTree();
    this.options.onExpandedChange?.(groupKey, expanded);
    return expanded;
  }

  private buildFlatRows(): PresentationRow<TData>[] {
    const rows: PresentationRow<TData>[] = [];
    const cachedRows = this.options.getCachedRows();
    const totalRows = this.options.getTotalRows();
    for (let rowIndex = 0; rowIndex < totalRows; rowIndex++) {
      const rowData = cachedRows.get(rowIndex);
      if (rowData === undefined) continue;
      rows.push({ kind: "data", rowIndex, rowData });
    }
    return rows;
  }

  private buildTree(groupColumns: string[]): GroupNode<TData> {
    const root: GroupNode<TData> = {
      key: "",
      depth: -1,
      field: "",
      value: "",
      rows: [],
      children: new Map(),
    };
    const cachedRows = this.options.getCachedRows();
    const totalRows = this.options.getTotalRows();
    for (let rowIndex = 0; rowIndex < totalRows; rowIndex++) {
      const rowData = cachedRows.get(rowIndex);
      if (rowData === undefined) continue;
      this.insertRow(root, groupColumns, rowIndex, rowData);
    }
    return root;
  }

  private insertRow(
    root: GroupNode<TData>,
    groupColumns: string[],
    rowIndex: number,
    rowData: TData,
  ): void {
    let node = root;
    for (let depth = 0; depth < groupColumns.length; depth++) {
      const field = groupColumns[depth]!;
      const value = getFieldValue(rowData, field);
      const key = buildGroupKey(node.key, field, value);
      let child = node.children.get(key);
      if (!child) {
        child = { key, depth, field, value, rows: [], children: new Map() };
        node.children.set(key, child);
      }
      child.rows.push({ rowIndex, rowData });
      node = child;
    }
  }

  private flattenNode(
    node: GroupNode<TData>,
    rows: PresentationRow<TData>[],
    grouping: RowGroupingOptions,
  ): void {
    const expanded = this.isExpanded(node, grouping);
    rows.push({
      kind: "group",
      groupKey: node.key,
      depth: node.depth,
      field: node.field,
      value: node.value,
      childCount: node.rows.length,
      expanded,
    });
    if (!expanded) return;

    if (node.children.size > 0) {
      for (const child of node.children.values()) {
        this.flattenNode(child, rows, grouping);
      }
      return;
    }

    for (const row of node.rows) {
      rows.push({ kind: "data", rowIndex: row.rowIndex, rowData: row.rowData });
    }
  }

  private isExpanded(node: GroupNode<TData>, grouping: RowGroupingOptions): boolean {
    const override = this.expansionOverrides.get(node.key);
    if (override !== undefined) return override;
    return node.depth < (grouping.defaultExpandedDepth ?? 0);
  }

  private isGroupExpanded(groupKey: string): boolean {
    const row = this.presentationRows.find((entry) =>
      entry.kind === "group" && entry.groupKey === groupKey
    );
    return row?.kind === "group" ? row.expanded : false;
  }
}

const normalizeGrouping = (
  grouping: RowGroupingOptions | undefined,
): RowGroupingOptions | undefined => {
  const columns = grouping?.columns.filter(Boolean) ?? [];
  if (columns.length === 0) return undefined;
  return { ...grouping, columns };
};

const buildGroupKey = (parentKey: string, field: string, value: CellValue): string => {
  const encodedValue = encodeURIComponent(String(value ?? ""));
  const segment = `${field}:${encodedValue}`;
  return parentKey ? `${parentKey}|${segment}` : segment;
};
