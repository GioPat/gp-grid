// PRD 007 column-group fixture for `ssr-smoke.mjs` and the assertions on a
// server-rendered grouped header (D8-D10). Expectations are written out from
// the descriptors; nothing here asks the core what it should render.

const LEAF_WIDTH = 120;
export const HEADER_HEIGHT = 32;
/** Every band configured; the last one is the tall band of AC-007-12. */
export const BAND_HEIGHTS = [40, 28, 36, 72];
const BAND_OFFSETS = [0, 40, 68, 104];
const TOTAL_HEIGHT = 176;
const BAND_COUNT = BAND_HEIGHTS.length;

/** Far taller than its 72 px band at 120 px wide, so the header cell clips it. */
const WRAPPED_HEADER_NAME =
  "Quarterly revenue before returns, credits and every regional adjustment is applied";

/** Depth-first leaf order, which the grid displays while the groups are active. */
export const DISPLAY_ORDER = ["a", "b", "c", "d", "e", "f", "x"];
/** Each leaf's first band: one band per group above it. */
const FIRST_BAND = { a: 3, b: 3, c: 2, d: 1, e: 1, f: 1, x: 0 };

const leafColumn = (id) => ({
  colId: id,
  field: id,
  headerName: `Leaf ${id}`,
  width: LEAF_WIDTH,
  cellDataType: "text",
});

/** Defined with `x` first, so a depth-first render is visible. */
export const groupColumns = [
  leafColumn("x"),
  { ...leafColumn("a"), headerName: WRAPPED_HEADER_NAME, wrapHeaderText: true },
  ...["b", "c", "d", "e", "f"].map(leafColumn),
];

export const groupRows = Array.from({ length: 3 }, (_value, row) => ({
  id: row + 1,
  ...Object.fromEntries(DISPLAY_ORDER.map((id) => [id, `${id}${row}`])),
}));

/**
 * Three levels over `a`/`b`, the uneven `c` and `d`, a second root group and
 * the ungrouped `x`. Every `headerName` differs from its `groupId`, `q-1`
 * needs the D9 escape, `north` wraps and `totals` names the `totals` renderer.
 */
export const columnGroups = [
  {
    groupId: "region",
    headerName: "Region",
    children: [
      {
        groupId: "north",
        headerName: "North",
        wrapHeaderText: true,
        children: [{ groupId: "q-1", headerName: "Q1", children: ["a", "b"] }, "c"],
      },
      "d",
    ],
  },
  { groupId: "totals", headerName: "Totals", headerRenderer: "totals", children: ["e", "f"] },
  "x",
];

/** Class and text of the `totals` renderer; each wrapper registers its own. */
export const GROUP_RENDERER_CLASS = "ssr-group-renderer";
export const groupRendererText = (params) => `${params.group.headerName}: ${params.columnIds.join("+")}`;

/** Every run of the fixture, all leaves in the center region, with its rendered content. */
const RUNS = [
  { groupId: "region", band: 0, first: 0, count: 4, wrap: false, text: "Region" },
  { groupId: "totals", band: 0, first: 4, count: 2, wrap: false, rendered: "Totals: e+f" },
  { groupId: "north", band: 1, first: 0, count: 3, wrap: true, text: "North" },
  { groupId: "q-1", band: 2, first: 0, count: 2, wrap: false, text: "Q1" },
].map((run) => ({ ...run, fragmentId: `${run.groupId}:center:0` }));

/** The D9 escape, written apart from core's `escapeDomIdPart`. */
const escapeIdPart = (part) =>
  Array.from(part, (character) =>
    /^[A-Za-z0-9]$/.test(character) ? character : `_${character.codePointAt(0).toString(16)}_`,
  ).join("");

const unescapeIdPart = (part) =>
  part.replace(/_([0-9a-f]+)_/g, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)));

const leafDomId = (instance, columnId) => `${instance}-h-${escapeIdPart(columnId)}`;
const fragmentDomId = (instance, run) => `${instance}-${escapeIdPart(run.fragmentId)}`;

const holds = (run, displayIndex) => displayIndex >= run.first && displayIndex < run.first + run.count;

/** The runs a window over the `mounted` leaves carries as fragments. */
const fragmentsOver = (mounted) =>
  RUNS.filter((run) => mounted.some((columnId) => holds(run, DISPLAY_ORDER.indexOf(columnId))));

export const expectList = (actual, expected, label) => {
  if (actual.join(",") !== expected.join(",")) {
    throw new Error(`${label}: expected ${expected.join(",")}, got ${actual.join(",")}`);
  }
};

/** The bands a core publishes for the fixture. */
export const expectCoreBands = (bands, label) => {
  expectList([bands.count], [BAND_COUNT], `${label}.count`);
  expectList(bands.heights, BAND_HEIGHTS, `${label}.heights`);
  expectList(bands.offsets, BAND_OFFSETS, `${label}.offsets`);
  expectList([bands.totalHeight], [TOTAL_HEIGHT], `${label}.totalHeight`);
};

const describeFragment = (fragment) =>
  [fragment.fragmentId, fragment.band, fragment.firstDisplayIndex, fragment.leafCount, fragment.regionOffset, fragment.width].join("/");

/** The fragments of a core window over every leaf. */
export const expectCoreFragments = (groups, label) => {
  expectList([...groups.start, ...groups.end], [], `${label} pin fragments`);
  const expected = RUNS.map((run) =>
    describeFragment({
      fragmentId: run.fragmentId,
      band: run.band,
      firstDisplayIndex: run.first,
      leafCount: run.count,
      regionOffset: run.first * LEAF_WIDTH,
      width: run.count * LEAF_WIDTH,
    }),
  );
  expectList(groups.center.map(describeFragment).sort(), expected.sort(), `${label} center fragments`);
  return groups.center.map((fragment) => fragment.fragmentId).join(" ");
};

/** The header root's start tag up to the body. */
const headerSection = (html) => {
  const at = html.search(/class="gp-grid-header[ "]/);
  if (at === -1) throw new Error("No server-rendered header.");
  const end = html.indexOf("gp-grid-body", at);
  return html.slice(html.lastIndexOf("<", at), end === -1 ? undefined : end);
};

const parseAttributes = (source) =>
  Object.fromEntries(Array.from(source.matchAll(/([^\s=]+)(?:="([^"]*)")?/g), (match) => [match[1], match[2] ?? ""]));

/** Every `div` start tag of the header, in document order. */
const headerElements = (section) =>
  Array.from(section.matchAll(/<div\b([^>]*)>/g), (match) => ({
    attributes: parseAttributes(match[1]),
    end: match.index + match[0].length,
  }));

const classesOf = (element) => (element.attributes.class ?? "").split(/\s+/);

const pixelsOf = (element) =>
  Object.fromEntries(
    (element.attributes.style ?? "")
      .split(";")
      .map((declaration) => declaration.split(":").map((part) => part.trim()))
      .filter(([property]) => property !== "")
      .map(([property, value]) => [property, Number.parseFloat(value)]),
  );

/** Text of the first `span.<className>` inside one header cell. */
const spanTextOf = (section, element, className) => {
  const next = section.indexOf("<div", element.end);
  const content = section.slice(element.end, next === -1 ? undefined : next);
  return new RegExp(`<span\\b[^>]*class="${className}"[^>]*>([^<]*)<`).exec(content)?.[1];
};

const headerTextOf = (section, element) => spanTextOf(section, element, "gp-grid-header-text");

/** `undefined` in `expected` means the attribute is absent. */
const expectElement = (element, expected, label) => {
  for (const [name, value] of Object.entries(expected.attributes)) {
    if (element.attributes[name] !== value) {
      throw new Error(`${label} [${name}]: expected ${String(value)}, got ${String(element.attributes[name])}`);
    }
  }
  const pixels = pixelsOf(element);
  for (const [property, value] of Object.entries(expected.pixels)) {
    if (pixels[property] !== value) {
      throw new Error(`${label} ${property}: expected ${value}px, got ${String(pixels[property])}px`);
    }
  }
};

/** The instance part of a leaf id, which must already be in its escaped form. */
const instanceOf = (leaf, columnId) => {
  const suffix = `-h-${escapeIdPart(columnId)}`;
  const id = leaf.attributes.id ?? "";
  const instance = id.slice(0, -suffix.length);
  if (id.endsWith(suffix) === false || /^[A-Za-z0-9_]+$/.test(instance) === false) {
    throw new Error(`Leaf ${columnId} id ${id} is not <escaped instance>${suffix}`);
  }
  if (escapeIdPart(unescapeIdPart(instance)) !== instance) {
    throw new Error(`Instance ${instance} is not the D9 escape of its prefix`);
  }
  return instance;
};

const fragmentExpectation = (run, instance) => ({
  attributes: {
    id: fragmentDomId(instance, run),
    role: "columnheader",
    "aria-colindex": String(run.first + 1),
    "aria-colspan": String(run.count),
    "aria-rowindex": String(run.band + 1),
    "data-group-id": run.groupId,
    "data-band": String(run.band),
    "data-fragment": run.fragmentId,
    "data-col-index": undefined,
  },
  pixels: {
    top: BAND_OFFSETS[run.band],
    height: BAND_HEIGHTS[run.band],
    width: run.count * LEAF_WIDTH,
    "inset-inline-start": run.first * LEAF_WIDTH,
  },
});

/** A leaf spans from its first band to the body; its ancestors describe it, outermost first. */
const leafExpectation = (columnId, instance, fragments) => {
  const displayIndex = DISPLAY_ORDER.indexOf(columnId);
  const band = FIRST_BAND[columnId];
  const ancestors = fragments.filter((run) => run.band < band && holds(run, displayIndex));
  const describedBy = ancestors.map((run) => fragmentDomId(instance, run)).join(" ");
  return {
    attributes: {
      id: leafDomId(instance, columnId),
      "aria-colindex": String(displayIndex + 1),
      "aria-rowindex": String(band + 1),
      "aria-rowspan": String(BAND_COUNT - band),
      "aria-describedby": describedBy === "" ? undefined : describedBy,
    },
    pixels: {
      top: BAND_OFFSETS[band],
      height: TOTAL_HEIGHT - BAND_OFFSETS[band],
      width: LEAF_WIDTH,
      "inset-inline-start": displayIndex * LEAF_WIDTH,
    },
  };
};

/** Each band row owns the headers starting in its band, in display order. */
const expectedOwns = (instance, fragments, mounted) =>
  BAND_HEIGHTS.map((_height, band) =>
    [
      ...fragments
        .filter((run) => run.band === band)
        .map((run) => ({ at: run.first, id: fragmentDomId(instance, run) })),
      ...mounted
        .filter((columnId) => FIRST_BAND[columnId] === band)
        .map((columnId) => ({ at: DISPLAY_ORDER.indexOf(columnId), id: leafDomId(instance, columnId) })),
    ]
      .sort((left, right) => left.at - right.at)
      .map((header) => header.id)
      .join(" "),
  );

const expectBandRows = (rows, owns, label) => {
  const indexes = BAND_HEIGHTS.map((_height, band) => String(band + 1));
  expectList(rows.map((row) => row.attributes["aria-rowindex"]), indexes, `${label} band rows`);
  rows.forEach((row, band) => {
    if ((row.attributes["aria-owns"] ?? "") !== owns[band]) {
      throw new Error(`${label} band ${band} owns "${row.attributes["aria-owns"]}", expected "${owns[band]}"`);
    }
  });
};

/** The group's `headerName` and wrap class, or its renderer's output in place of the text. */
const fragmentContentOf = (section, element) => ({
  wrap: classesOf(element).includes("gp-grid-header-cell--wrap"),
  text: headerTextOf(section, element),
  rendered: spanTextOf(section, element, GROUP_RENDERER_CLASS),
});

const expectFragments = (section, fragments, expected, context) => {
  const { instance, label } = context;
  expectList(
    fragments.map((element) => element.attributes["data-fragment"]),
    expected.map((run) => run.fragmentId),
    `${label} fragments`,
  );
  fragments.forEach((element, index) => {
    const run = expected[index];
    expectElement(element, fragmentExpectation(run, instance), `${label} ${run.fragmentId}`);
    const actual = JSON.stringify(fragmentContentOf(section, element));
    const wanted = JSON.stringify({ wrap: run.wrap, text: run.text, rendered: run.rendered });
    if (actual !== wanted) throw new Error(`${label} ${run.fragmentId} content: expected ${wanted}, got ${actual}`);
  });
};

/** AC-007-12: the wrapped leaf in the tall band keeps the band's height and the clip contract. */
const expectClippedLeaf = (section, leaves, label) => {
  const leaf = leaves.find((element) => element.attributes["aria-colindex"] === "1");
  if (classesOf(leaf).includes("gp-grid-header-cell--wrap") === false) {
    throw new Error(`${label} leaf a has no gp-grid-header-cell--wrap`);
  }
  const tallBand = BAND_HEIGHTS.at(-1);
  if (pixelsOf(leaf).height !== tallBand) {
    throw new Error(`${label} leaf a is ${pixelsOf(leaf).height}px, expected its band's ${tallBand}px`);
  }
  if (headerTextOf(section, leaf) !== WRAPPED_HEADER_NAME) {
    throw new Error(`${label} leaf a does not serialize its whole wrapped header`);
  }
};

/**
 * The grouped header a wrapper serializes: the fragments of the window over
 * `mounted`, with D9 ids, ARIA and each group's `headerName`, wrap class or
 * renderer, every band at its configured height and the clipped tall-band leaf.
 */
export const expectGroupedHeader = (html, { label, mounted = DISPLAY_ORDER }) => {
  const section = headerSection(html);
  const [root, ...elements] = headerElements(section);
  expectElement(root, { attributes: { role: "rowgroup" }, pixels: { height: TOTAL_HEIGHT } }, `${label} header root`);
  const cells = elements.filter((element) => classesOf(element).includes("gp-grid-header-cell"));
  const fragments = cells.filter((element) => classesOf(element).includes("gp-grid-header-group"));
  const leaves = cells.filter((element) => fragments.includes(element) === false);
  const leafIds = leaves.map((leaf) => DISPLAY_ORDER[Number(leaf.attributes["aria-colindex"]) - 1]);
  expectList(leafIds, mounted, `${label} mounted leaves`);
  const instance = instanceOf(leaves[0], leafIds[0]);
  const expected = fragmentsOver(mounted);
  expectFragments(section, fragments, expected, { instance, label });
  leaves.forEach((leaf, index) =>
    expectElement(leaf, leafExpectation(leafIds[index], instance, expected), `${label} leaf ${leafIds[index]}`));
  const rows = elements.filter((element) => element.attributes.role === "row");
  expectBandRows(rows, expectedOwns(instance, expected, mounted), label);
  expectClippedLeaf(section, leaves, label);
  const labels = fragments
    .map((element) => headerTextOf(section, element) ?? spanTextOf(section, element, GROUP_RENDERER_CLASS))
    .join(",");
  return `${label}: ${expected.length} fragments (${labels}) over ${mounted.join("")}, bands ${BAND_HEIGHTS.join("/")}px, instance ${unescapeIdPart(instance)} -> ${instance}`;
};

/** The shipped stylesheet clips a header cell on the block axis and caps wrapped text at the cell. */
export const expectHeaderClipRules = (css, label) => {
  if (/\.gp-grid-header-cell\{[^}]*overflow-y:\s*clip/.test(css) === false) {
    throw new Error(`${label} stylesheet does not clip .gp-grid-header-cell`);
  }
  if (/\.gp-grid-header-cell--wrap \.gp-grid-header-text\{[^}]*max-height:\s*100%/.test(css) === false) {
    throw new Error(`${label} stylesheet does not cap wrapped header text`);
  }
  return "clip rules shipped";
};
