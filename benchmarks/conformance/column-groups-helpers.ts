// benchmarks/conformance/column-groups-helpers.ts
// Fixture vocabulary for the column-group suites (PRD 007): arming, the header
// hooks, the header DOM reader and an independent oracle of the header runs.

import { expect, type Locator, type Page } from "@playwright/test";
import { columnState, layoutColumns, openFixture, readHook, TOLERANCE, type ColumnStateSnapshot } from "./helpers";

/** Slice 3 recipe: 32 px rows, 36 px bands, fixed 120 px leaves. */
export const ROW_HEIGHT = 32;
export const HEADER_HEIGHT = 36;
export const LEAF_WIDTH = 120;
export const TALL_BAND_HEIGHT = 72;
export const LEAF_IDS = ["a", "b", "c", "d", "e", "f", "x"] as const;
/** Layout indexes in descriptor order. */
export const A = 0;
export const B = 1;
export const X = 6;
export const WIDE_LEAF_COUNT = 200;
/** The wide arm's leaf whose wrapped header is taller than its band. */
export const WIDE_TALL_LEAF = 150;

export interface GroupDescriptor {
  groupId: string;
  headerName?: string;
  children: GroupChild[];
}
export type GroupChild = GroupDescriptor | string;

const group = (groupId: string, children: GroupChild[]): GroupDescriptor =>
  ({ groupId, headerName: groupId, children });

/** Mirrors the fixture: `Region{ North{ Q1{...q1}, ...north }, d }`, `Totals{ e, f }`, `x`. */
const createGroups = (q1: GroupChild[], north: GroupChild[]): GroupChild[] => [
  group("Region", [group("North", [group("Q1", q1), ...north]), "d"]),
  group("Totals", ["e", "f"]),
  "x",
];

export const GROUPS = createGroups(["a", "b"], ["c"]);
/** `replace-groups`: Q1 keeps `a`, and `b` joins North. */
export const REPLACEMENT_GROUPS = createGroups(["a"], ["b", "c"]);

export interface HeaderBands {
  count: number;
  heights: number[];
  offsets: number[];
  totalHeight: number;
}

export const bandsOf = (heights: number[]): HeaderBands => {
  const offsets = heights.map((_, band) => heights.slice(0, band).reduce((sum, height) => sum + height, 0));
  return { count: heights.length, heights, offsets, totalHeight: heights.reduce((sum, height) => sum + height, 0) };
};

export type Region = "start" | "center" | "end";

export interface CoreFragment {
  fragmentId: string;
  groupId: string;
  band: number;
  region: Region;
  runIndex: number;
  firstDisplayIndex: number;
  leafCount: number;
  regionOffset: number;
  width: number;
}

export interface SchemaResult {
  status: "applied" | "unchanged" | "rejected";
  error?: { code: string; source: string; id?: string; limit?: string; message: string };
}

export type ColumnGroupsArm = "groups" | "wide";

const callHook = <T>(page: Page, name: string, args: unknown[]): Promise<T> =>
  page.evaluate(
    ({ hookName, hookArgs }) => {
      const hooks = (globalThis as unknown as {
        __gpConformance?: Record<string, (...values: unknown[]) => unknown>;
      }).__gpConformance;
      return hooks?.[hookName]?.(...hookArgs) ?? null;
    },
    { hookName: name, hookArgs: args },
  ) as Promise<T>;

export const headerBands = (page: Page): Promise<HeaderBands | null> =>
  readHook<HeaderBands | null>(page, "headerBands");
export const headerFragments = (page: Page): Promise<CoreFragment[]> =>
  readHook<CoreFragment[]>(page, "headerFragments");
/** The core's active hierarchy, read back as the caller passed it. */
export const columnGroups = (page: Page): Promise<GroupChild[] | null> =>
  readHook<GroupChild[] | null>(page, "columnGroups");
export const lastSchemaResult = (page: Page): Promise<SchemaResult | null> =>
  readHook<SchemaResult | null>(page, "lastSchemaResult");
export const setColumnGroups = (page: Page, groups: GroupChild[] | null): Promise<void> =>
  callHook<void>(page, "setColumnGroups", [groups]);
export const setHeaderBandHeights = (page: Page, heights: number[] | null): Promise<void> =>
  callHook<void>(page, "setHeaderBandHeights", [heights]);
export const pinColumn = (page: Page, columnId: string, pinned: "start" | "end" | null): Promise<void> =>
  callHook<void>(page, "pinColumn", [columnId, pinned]);
export const setColumnWidth = (page: Page, columnId: string, width: number | null): Promise<void> =>
  callHook<void>(page, "setColumnWidth", [columnId, width]);

export const armColumnGroups = async (
  page: Page,
  framework: string,
  arm: ColumnGroupsArm = "groups",
): Promise<Error[]> => {
  const pageErrors = await openFixture(page, framework);
  await page.getByTestId(arm === "groups" ? "use-column-groups" : "use-wide-groups").click();
  const ids = arm === "groups"
    ? [...LEAF_IDS]
    : Array.from({ length: WIDE_LEAF_COUNT }, (_, index) => `w${index}`);
  await expect.poll(() => readHook<string[]>(page, "columnIds")).toEqual(ids);
  const bandCount = arm === "groups" ? 4 : 3;
  await expect.poll(async () => (await headerBands(page))?.count).toBe(bandCount);
  await expect(page.locator('.gp-grid-header > [role="row"]')).toHaveCount(bandCount);
  await expect(page.locator('[data-cell-row="0"][data-cell-col="0"]')).toHaveText(arm === "groups" ? "A 0" : "0");
  return pageErrors;
};

/** One header cell, a fragment or a leaf, as the DOM renders it. */
export interface HeaderCellView {
  kind: "fragment" | "leaf";
  id: string;
  region: Region;
  groupId: string | null;
  band: number | null;
  fragmentId: string | null;
  layoutIndex: number | null;
  colIndex: number;
  colSpan: number;
  rowIndex: number | null;
  rowSpan: number | null;
  describedBy: string[];
  /** Block offsets from the header's content top. */
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
  /** Inline offset inside its region container. */
  containerOffset: number;
  text: string;
}

export interface HeaderView {
  role: string | null;
  rowIndex: string | null;
  /** The header's content height: every band. */
  clientHeight: number;
  /** Body scroller top minus the header's bottom edge. */
  bodyGap: number;
  bandRows: { rowIndex: number; owns: string[] }[];
  cells: HeaderCellView[];
}

export const readHeader = (page: Page): Promise<HeaderView> =>
  page.locator(".gp-grid-header").first().evaluate((header) => {
    const root = header.getBoundingClientRect();
    const originTop = root.top + header.clientTop;
    const scroller = header.closest('[role="grid"]')?.querySelector(".gp-grid-body-scroll");
    const numberAttribute = (node: Element, name: string): number | null => {
      const value = node.getAttribute(name);
      return value === null ? null : Number(value);
    };
    const cells = Array.from(header.querySelectorAll<HTMLElement>('[role="columnheader"]')).map((node) => {
      const box = node.getBoundingClientRect();
      const container = node.parentElement?.getBoundingClientRect() ?? box;
      return {
        kind: node.classList.contains("gp-grid-header-group") ? "fragment" as const : "leaf" as const,
        id: node.id,
        region: (node.closest("[data-pin-region]")?.getAttribute("data-pin-region") ?? "center") as Region,
        groupId: node.getAttribute("data-group-id"),
        band: numberAttribute(node, "data-band"),
        fragmentId: node.getAttribute("data-fragment"),
        layoutIndex: numberAttribute(node, "data-col-index"),
        colIndex: numberAttribute(node, "aria-colindex") ?? -1,
        colSpan: numberAttribute(node, "aria-colspan") ?? 1,
        rowIndex: numberAttribute(node, "aria-rowindex"),
        rowSpan: numberAttribute(node, "aria-rowspan"),
        describedBy: (node.getAttribute("aria-describedby") ?? "").split(" ").filter((id) => id !== ""),
        top: box.top - originTop,
        bottom: box.bottom - originTop,
        left: box.left,
        right: box.right,
        width: box.width,
        height: box.height,
        containerOffset: box.left - container.left,
        text: node.textContent?.trim() ?? "",
      };
    });
    return {
      role: header.getAttribute("role"),
      rowIndex: header.getAttribute("aria-rowindex"),
      clientHeight: header.clientHeight,
      bodyGap: scroller === null || scroller === undefined ? Number.NaN : scroller.getBoundingClientRect().top - root.bottom,
      bandRows: Array.from(header.querySelectorAll(':scope > [role="row"]')).map((row) => ({
        rowIndex: Number(row.getAttribute("aria-rowindex")),
        owns: (row.getAttribute("aria-owns") ?? "").split(" ").filter((id) => id !== ""),
      })),
      cells,
    };
  });

export const fragmentsOf = (view: HeaderView, groupId?: string): HeaderCellView[] =>
  view.cells.filter((cell) => cell.kind === "fragment" && (groupId === undefined || cell.groupId === groupId));

/** The D9 id escape: every character outside `[A-Za-z0-9]` becomes `_<hex>_`. */
export const escapeIdPart = (part: string): string =>
  part.replace(/[^A-Za-z0-9]/gu, (character) => `_${character.codePointAt(0)?.toString(16)}_`);

/** Group ids above each leaf, outermost first. */
const ancestorsOf = (groups: readonly GroupChild[]): Map<string, string[]> => {
  const ancestors = new Map<string, string[]>();
  const stack: { child: GroupChild; path: string[] }[] = groups.map((child) => ({ child, path: [] }));
  while (stack.length > 0) {
    const { child, path } = stack.pop()!;
    if (typeof child === "string") {
      ancestors.set(child, path);
      continue;
    }
    for (const nested of child.children) stack.push({ child: nested, path: [...path, child.groupId] });
  }
  return ancestors;
};

export interface ExpectedRun {
  fragmentId: string;
  groupId: string;
  band: number;
  region: Region;
  firstDisplayIndex: number;
  leafCount: number;
}

export interface ExpectedHeader {
  bandCount: number;
  /** Displayed leaves in display order, with their first band. */
  leaves: { columnId: string; region: Region; depth: number }[];
  runs: ExpectedRun[];
}

const runsOfBand = (leaves: ExpectedHeader["leaves"], ancestors: Map<string, string[]>, band: number): ExpectedRun[] => {
  const runs: ExpectedRun[] = [];
  const counts = new Map<string, number>();
  let current: ExpectedRun | null = null;
  for (const [displayIndex, leaf] of leaves.entries()) {
    const groupId = ancestors.get(leaf.columnId)?.[band];
    if (current !== null && current.groupId === groupId && current.region === leaf.region) {
      current.leafCount += 1;
      continue;
    }
    current = null;
    if (groupId === undefined) continue;
    const key = `${groupId}:${leaf.region}`;
    const runIndex = counts.get(key) ?? 0;
    counts.set(key, runIndex + 1);
    current = { fragmentId: `${key}:${runIndex}`, groupId, band, region: leaf.region, firstDisplayIndex: displayIndex, leafCount: 1 };
    runs.push(current);
  }
  return runs;
};

/** D7 from the descriptors and the column state alone, independent of the core's runs. */
export const expectedHeader = (state: ColumnStateSnapshot[], groups: readonly GroupChild[]): ExpectedHeader => {
  const ancestors = ancestorsOf(groups);
  const leaves = state
    .filter((column) => column.hidden === false && column.region !== null)
    .map((column) => ({
      columnId: column.columnId,
      region: column.region as Region,
      depth: ancestors.get(column.columnId)?.length ?? 0,
    }));
  const bandCount = 1 + Math.max(0, ...leaves.map((leaf) => leaf.depth));
  const runs = Array.from({ length: bandCount - 1 }, (_, band) => runsOfBand(leaves, ancestors, band)).flat();
  return { bandCount, leaves, runs };
};

export interface HeaderSample {
  view: HeaderView;
  bands: HeaderBands;
  fragments: CoreFragment[];
  layout: { columnId: string; layoutIndex: number; width: number }[];
  state: ColumnStateSnapshot[];
}

export const sampleHeader = async (page: Page): Promise<HeaderSample> => ({
  view: await readHeader(page),
  bands: (await headerBands(page))!,
  fragments: await headerFragments(page),
  layout: await layoutColumns(page),
  state: await columnState(page),
});

const near = (a: number, b: number): boolean => Math.abs(a - b) <= TOLERANCE;

const fragmentMismatch = (sample: HeaderSample, expected: ExpectedHeader, cell: HeaderCellView): string | null => {
  const { bands, fragments, layout } = sample;
  const run = expected.runs.find((entry) => entry.fragmentId === cell.fragmentId);
  if (run === undefined) return `unexpected fragment ${cell.fragmentId}`;
  const label = `fragment ${run.fragmentId}`;
  if (cell.groupId !== run.groupId || cell.band !== run.band || cell.region !== run.region) return `${label} placement`;
  if (cell.colIndex !== run.firstDisplayIndex + 1 || cell.colSpan !== run.leafCount) {
    return `${label} aria-colindex ${cell.colIndex}/colspan ${cell.colSpan}`;
  }
  if (cell.rowIndex !== run.band + 1 || cell.layoutIndex !== null) return `${label} aria-rowindex or data-col-index`;
  if (cell.id.endsWith(`-${escapeIdPart(run.fragmentId)}`) === false) return `${label} id ${cell.id}`;
  if (near(cell.top, bands.offsets[run.band]!) === false || near(cell.height, bands.heights[run.band]!) === false) {
    return `${label} top ${cell.top} height ${cell.height}`;
  }
  const core = fragments.find((entry) => entry.fragmentId === run.fragmentId);
  if (core === undefined) return `${label} not published`;
  if (near(cell.containerOffset, core.regionOffset) === false || near(cell.width, core.width) === false) {
    return `${label} offset ${cell.containerOffset}/${core.regionOffset} width ${cell.width}/${core.width}`;
  }
  const leafWidths = expected.leaves.slice(run.firstDisplayIndex, run.firstDisplayIndex + run.leafCount)
    .map((leaf) => layout.find((column) => column.columnId === leaf.columnId)?.width ?? Number.NaN);
  if (near(cell.width, leafWidths.reduce((sum, width) => sum + width, 0)) === false) return `${label} width vs leaves`;
  const first = sample.view.cells.find((entry) => entry.kind === "leaf" && entry.colIndex === run.firstDisplayIndex + 1);
  const last = sample.view.cells.find((entry) => entry.kind === "leaf" && entry.colIndex === run.firstDisplayIndex + run.leafCount);
  if (first !== undefined && near(cell.left, first.left) === false) return `${label} starts off its first leaf`;
  if (last !== undefined && near(cell.right, last.right) === false) return `${label} ends off its last leaf`;
  return null;
};

/** Mounted fragments above a leaf, outermost first: the D9 `aria-describedby`. */
const ancestorIdsOf = (view: HeaderView, leaf: HeaderCellView, depth: number): string[] =>
  fragmentsOf(view)
    .filter((fragment) => fragment.region === leaf.region && fragment.band! < depth)
    .filter((fragment) => fragment.colIndex <= leaf.colIndex && leaf.colIndex < fragment.colIndex + fragment.colSpan)
    .sort((a, b) => a.band! - b.band!)
    .map((fragment) => fragment.id);

const leafMismatch = (sample: HeaderSample, expected: ExpectedHeader, cell: HeaderCellView): string | null => {
  const { bands, layout, view } = sample;
  const columnId = layout.find((column) => column.layoutIndex === cell.layoutIndex)?.columnId;
  const displayIndex = expected.leaves.findIndex((leaf) => leaf.columnId === columnId);
  const leaf = expected.leaves[displayIndex];
  if (columnId === undefined || leaf === undefined) return `unexpected leaf ${cell.layoutIndex}`;
  const label = `leaf ${columnId}`;
  if (cell.colIndex !== displayIndex + 1 || cell.region !== leaf.region) return `${label} aria-colindex ${cell.colIndex}`;
  if (cell.id.endsWith(`-h-${escapeIdPart(columnId)}`) === false) return `${label} id ${cell.id}`;
  if (cell.rowIndex !== leaf.depth + 1 || cell.rowSpan !== expected.bandCount - leaf.depth) {
    return `${label} aria-rowindex ${cell.rowIndex}/rowspan ${cell.rowSpan}`;
  }
  if (cell.describedBy.join(" ") !== ancestorIdsOf(view, cell, leaf.depth).join(" ")) return `${label} aria-describedby`;
  if (near(cell.top, bands.offsets[leaf.depth]!) === false) return `${label} top ${cell.top}`;
  if (near(cell.bottom, bands.totalHeight) === false) return `${label} bottom ${cell.bottom}`;
  return null;
};

/** Every mounted header sits in exactly the band row of its own `aria-rowindex`. */
const ownershipMismatch = (view: HeaderView, bandCount: number): string | null => {
  if (view.bandRows.length !== bandCount) return `${view.bandRows.length} band rows`;
  for (const [band, row] of view.bandRows.entries()) {
    if (row.rowIndex !== band + 1) return `band row ${band} aria-rowindex ${row.rowIndex}`;
    const starting = view.cells.filter((cell) => cell.rowIndex === band + 1).map((cell) => cell.id).sort();
    if ([...row.owns].sort().join(" ") !== starting.join(" ")) return `band row ${band + 1} aria-owns`;
  }
  const ids = view.cells.map((cell) => cell.id);
  return new Set(ids).size === ids.length ? null : "duplicate header ids";
};

/** First difference between the rendered header and D7–D9, or `"ok"`. */
export const headerMismatch = (sample: HeaderSample, groups: readonly GroupChild[]): string => {
  const { view, bands } = sample;
  const expected = expectedHeader(sample.state, groups);
  if (bands.count !== expected.bandCount) return `band count ${bands.count} vs ${expected.bandCount}`;
  if (view.role !== "rowgroup" || view.rowIndex !== null) return `header role ${view.role}`;
  if (near(view.clientHeight, bands.totalHeight) === false || near(view.bodyGap, 0) === false) {
    return `header height ${view.clientHeight}, body gap ${view.bodyGap}`;
  }
  const rendered = fragmentsOf(view).map((cell) => cell.fragmentId).sort().join(" ");
  const runs = expected.runs.map((run) => run.fragmentId).sort().join(" ");
  if (rendered !== runs) return `fragments [${rendered}] vs runs [${runs}]`;
  for (const cell of view.cells) {
    const mismatch = cell.kind === "fragment"
      ? fragmentMismatch(sample, expected, cell)
      : leafMismatch(sample, expected, cell);
    if (mismatch !== null) return mismatch;
  }
  return ownershipMismatch(view, bands.count) ?? "ok";
};

/**
 * The header renders D7 for `groups` over the current column state: every
 * run as one fragment on its leaves and band, every leaf from its first band
 * to the body, with the D9 ids, spans and associations.
 */
export const expectGroupedHeader = async (page: Page, groups: readonly GroupChild[]): Promise<HeaderSample> => {
  const latest: { sample?: HeaderSample } = {};
  await expect.poll(async () => {
    latest.sample = await sampleHeader(page);
    return headerMismatch(latest.sample, groups);
  }).toBe("ok");
  return latest.sample!;
};

/** `aria-colindex`/`aria-colspan` and region of every rendered fragment of a group. */
export const groupSpans = async (page: Page, groupId: string): Promise<{ region: Region; colIndex: number; colSpan: number }[]> =>
  fragmentsOf(await readHeader(page), groupId)
    .map((cell) => ({ region: cell.region, colIndex: cell.colIndex, colSpan: cell.colSpan }))
    .sort((a, b) => a.colIndex - b.colIndex);

/** Header and body markup, for "nothing changed in the DOM". */
export const gridMarkup = (page: Page): Promise<{ header: string; body: string }> =>
  page.locator('[role="grid"]').evaluate((root) => ({
    header: root.querySelector(".gp-grid-header")?.outerHTML ?? "",
    body: root.querySelector(".gp-grid-body-scroll")?.outerHTML ?? "",
  }));

export const liveRegion = (page: Page): Locator => page.locator('[role="grid"] [role="status"]').last();

const FRAMES_KEY = "__gpHeaderFrames";

/**
 * Record the header state once per animation frame, as `q1` widths and spans
 * plus `b`'s band box, keeping each distinct state once.
 */
export const startHeaderFrames = (page: Page): Promise<void> =>
  page.evaluate((key) => {
    const store = window as unknown as Record<string, { frames: string[]; on: boolean } | undefined>;
    const recording = { frames: [] as string[], on: true };
    store[key] = recording;
    const sample = (): void => {
      if (recording.on === false) return;
      const header = document.querySelector<HTMLElement>(".gp-grid-header");
      const top = (header?.getBoundingClientRect().top ?? 0) + (header?.clientTop ?? 0);
      const q1 = Array.from(header?.querySelectorAll('[data-group-id="Q1"]') ?? [])
        .map((node) => `${Math.round(node.getBoundingClientRect().width)}:${node.getAttribute("aria-colspan")}`)
        .join(",");
      const leaf = header?.querySelector('[data-col-index="1"]');
      const box = leaf?.getBoundingClientRect();
      const b = box === undefined ? "none" : `${Math.round(box.top - top)},${Math.round(box.height)},${leaf?.getAttribute("aria-rowindex")}`;
      const state = `q1=${q1}|b=${b}`;
      if (recording.frames.at(-1) !== state) recording.frames.push(state);
      requestAnimationFrame(sample);
    };
    sample();
  }, FRAMES_KEY);

export const stopHeaderFrames = (page: Page): Promise<string[]> =>
  page.evaluate((key) => {
    const store = window as unknown as Record<string, { frames: string[]; on: boolean } | undefined>;
    const recording = store[key];
    if (recording === undefined) return [];
    recording.on = false;
    return recording.frames;
  }, FRAMES_KEY);

/** Wait two frames, so a render the last command scheduled has landed. */
export const nextFrames = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

export const generation = async (page: Page): Promise<number> => {
  const metrics = await page.getByTestId("metrics").textContent();
  return (JSON.parse(metrics ?? "{}") as { generation?: number }).generation ?? -1;
};
