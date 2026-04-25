import type { ColumnDefinition } from "../types/columns";

export type ColumnPinRegion = "left" | "center" | "right";

export interface ColumnLayoutItem {
  key: string;
  column: ColumnDefinition;
  originalIndex: number;
  visibleIndex: number;
  region: ColumnPinRegion;
  regionIndex: number;
  left: number;
  width: number;
}

export interface ColumnLayoutRegion {
  items: ColumnLayoutItem[];
  width: number;
}

export interface ColumnLayout {
  leftPinned: ColumnLayoutRegion;
  center: ColumnLayoutRegion;
  rightPinned: ColumnLayoutRegion;
  items: ColumnLayoutItem[];
  leftPinnedWidth: number;
  centerWidth: number;
  rightPinnedWidth: number;
  scrollableContentWidth: number;
  totalWidth: number;
}

export interface ColumnLayoutOptions {
  containerWidth?: number;
}

const getColumnKey = (column: ColumnDefinition, originalIndex: number): string =>
  column.colId ?? column.field ?? String(originalIndex);

const getPinRegion = (column: ColumnDefinition): ColumnPinRegion => {
  if (column.pinned === "left") return "left";
  if (column.pinned === "right") return "right";
  return "center";
};

const scaleWidths = (
  columns: ColumnDefinition[],
  containerWidth: number | undefined,
): number[] => {
  const widths = columns.map((column) => column.width);
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  if (containerWidth === undefined) return widths;
  if (containerWidth <= totalWidth || totalWidth === 0) return widths;

  const scaleFactor = containerWidth / totalWidth;
  return widths.map((width) => width * scaleFactor);
};

const buildRegion = (
  region: ColumnPinRegion,
  columns: Array<{ column: ColumnDefinition; originalIndex: number; visibleIndex: number; width: number }>,
): ColumnLayoutRegion => {
  let left = 0;
  const items = columns.map((entry, regionIndex) => {
    const item: ColumnLayoutItem = {
      key: getColumnKey(entry.column, entry.originalIndex),
      column: entry.column,
      originalIndex: entry.originalIndex,
      visibleIndex: entry.visibleIndex,
      region,
      regionIndex,
      left,
      width: entry.width,
    };
    left += entry.width;
    return item;
  });
  return { items, width: left };
};

export const computeColumnLayout = (
  columns: ColumnDefinition[],
  options: ColumnLayoutOptions = {},
): ColumnLayout => {
  const visible = columns
    .map((column, originalIndex) => ({ column, originalIndex }))
    .filter(({ column }) => column.hidden !== true);
  const widths = scaleWidths(
    visible.map(({ column }) => column),
    options.containerWidth,
  );

  const left: Array<{ column: ColumnDefinition; originalIndex: number; visibleIndex: number; width: number }> = [];
  const center: Array<{ column: ColumnDefinition; originalIndex: number; visibleIndex: number; width: number }> = [];
  const right: Array<{ column: ColumnDefinition; originalIndex: number; visibleIndex: number; width: number }> = [];

  visible.forEach(({ column, originalIndex }, visibleIndex) => {
    const entry = {
      column,
      originalIndex,
      visibleIndex,
      width: widths[visibleIndex] ?? column.width,
    };
    const region = getPinRegion(column);
    if (region === "left") left.push(entry);
    if (region === "center") center.push(entry);
    if (region === "right") right.push(entry);
  });

  const leftPinned = buildRegion("left", left);
  const centerRegion = buildRegion("center", center);
  const rightPinned = buildRegion("right", right);
  const items = [
    ...leftPinned.items,
    ...centerRegion.items,
    ...rightPinned.items,
  ];

  return {
    leftPinned,
    center: centerRegion,
    rightPinned,
    items,
    leftPinnedWidth: leftPinned.width,
    centerWidth: centerRegion.width,
    rightPinnedWidth: rightPinned.width,
    scrollableContentWidth: centerRegion.width,
    totalWidth: leftPinned.width + centerRegion.width + rightPinned.width,
  };
};

export const getColumnLayoutItemByOriginalIndex = (
  layout: ColumnLayout,
  originalIndex: number,
): ColumnLayoutItem | undefined =>
  layout.items.find((item) => item.originalIndex === originalIndex);

export const getColumnLayoutViewportLeft = (
  layout: ColumnLayout,
  item: ColumnLayoutItem,
  scrollLeft: number,
  viewportWidth: number,
): number => {
  if (item.region === "left") return item.left;
  if (item.region === "right") {
    return viewportWidth - layout.rightPinnedWidth + item.left;
  }
  return layout.leftPinnedWidth + item.left - scrollLeft;
};
