// packages/core/tests/measure-dom.test.ts
// PRD 007 D2: the DOM measurement host under happy-dom. Boxes are stubbed to
// answer their intrinsic size only while the measuring style is applied, so a
// size read outside the three passes shows up as 0; real sizes are proven in
// the browser.

import { afterEach, describe, expect, it } from "vitest";
import { createDomMeasurementHost } from "../src/adapter/measure-dom";

interface Intrinsic {
  width?: number;
  height?: number;
}

const stubBox = (element: HTMLElement, intrinsic: Intrinsic): void => {
  element.getBoundingClientRect = () => {
    const width = element.style.width === "max-content" ? intrinsic.width ?? 0 : 0;
    const height = element.style.height === "auto" ? intrinsic.height ?? 0 : 0;
    return { width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) };
  };
};

const sized = (element: HTMLElement, width: number, height: number): HTMLElement => {
  Object.defineProperty(element, "clientWidth", { configurable: true, value: width });
  Object.defineProperty(element, "clientHeight", { configurable: true, value: height });
  return element;
};

const cell = (row: number, col: number, intrinsic: Intrinsic, style?: string): HTMLElement => {
  const element = document.createElement("div");
  element.className = "gp-grid-cell";
  element.setAttribute("data-cell-row", String(row));
  element.setAttribute("data-cell-col", String(col));
  // Wrappers write styles through the CSSOM, so the attribute is its serialization.
  if (style !== undefined) element.style.cssText = style;
  stubBox(element, intrinsic);
  return element;
};

const header = (col: number, intrinsic: Intrinsic): HTMLElement => {
  const element = document.createElement("div");
  element.className = "gp-grid-header-cell";
  element.setAttribute("data-col-index", String(col));
  element.style.cssText = "inset-inline-start: 0px; width: 120px !important; height: 36px;";
  stubBox(element, intrinsic);
  return element;
};

const createRoot = (revision: string | null = "7"): HTMLElement => {
  const root = sized(document.createElement("div"), 400, 300);
  if (revision !== null) root.setAttribute("data-layout-revision", revision);
  document.body.appendChild(root);
  return root;
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("createDomMeasurementHost — nothing to measure against", () => {
  it("answers null without a root", () => {
    const host = createDomMeasurementHost(() => null);
    expect(host.measureRows([0])).toBeNull();
    expect(host.measureColumns([0])).toBeNull();
  });

  it("answers null for a zero-sized root", () => {
    const root = createRoot();
    root.appendChild(cell(0, 0, { height: 40 }));
    sized(root, 0, 300);
    const host = createDomMeasurementHost(() => root);
    expect(host.measureRows([0])).toBeNull();
    sized(root, 400, 0);
    expect(host.measureColumns([0])).toBeNull();
  });
});

describe("createDomMeasurementHost — rows", () => {
  it("reads the tallest mounted cell per requested row at its intrinsic height", () => {
    const root = createRoot();
    root.append(
      cell(0, 0, { height: 30 }),
      cell(0, 1, { height: 52 }),
      cell(1, 0, { height: 44 }),
      cell(2, 1, { height: 90 }),
    );
    const host = createDomMeasurementHost(() => root);

    const measured = host.measureRows([0, 1, 5]);

    expect(measured?.layoutRevision).toBe(7);
    expect(measured?.heights).toEqual(new Map([[0, 52], [1, 44]]));
    expect(measured?.consideredColumns).toBe(2);
  });

  it("skips editing cells", () => {
    const root = createRoot();
    const editing = cell(0, 1, { height: 200 });
    editing.classList.add("gp-grid-cell--editing");
    root.append(cell(0, 0, { height: 30 }), editing);
    const host = createDomMeasurementHost(() => root);

    expect(host.measureRows([0])?.heights).toEqual(new Map([[0, 30]]));
    expect(host.measureColumns([1])?.widths).toEqual(new Map());
  });
});

describe("createDomMeasurementHost — columns", () => {
  it("reads the widest of the header and the mounted body cells", () => {
    const root = createRoot();
    root.append(
      header(0, { width: 90 }),
      header(1, { width: 60 }),
      cell(0, 0, { width: 70 }),
      cell(1, 0, { width: 130 }),
      cell(0, 1, { width: 40 }),
      cell(0, 2, { width: 500 }),
    );
    const host = createDomMeasurementHost(() => root);

    const measured = host.measureColumns([0, 1]);

    expect(measured?.widths).toEqual(new Map([[0, 130], [1, 60]]));
    expect(measured?.consideredRows).toBe(2);
  });
});

describe("createDomMeasurementHost — nothing left behind", () => {
  it("restores every measured element's style attribute and priority", () => {
    const root = createRoot();
    const styled = cell(0, 0, { width: 70, height: 40 }, "inset-inline-start:0px;width:120px");
    const bare = cell(0, 1, { width: 50, height: 40 });
    const head = header(0, { width: 90 });
    root.append(styled, bare, head);
    const before = [styled, bare, head].map((element) => element.getAttribute("style"));
    const host = createDomMeasurementHost(() => root);

    host.measureRows([0]);
    host.measureColumns([0, 1]);

    expect([styled, bare, head].map((element) => element.getAttribute("style"))).toEqual(before);
    expect(bare.hasAttribute("style")).toBe(false);
    expect(head.style.getPropertyPriority("width")).toBe("important");
  });
});

describe("createDomMeasurementHost — revision", () => {
  it("reads the revision from the root attribute each time", () => {
    const root = createRoot("3");
    const host = createDomMeasurementHost(() => root);
    expect(host.measureRows([])?.layoutRevision).toBe(3);
    root.setAttribute("data-layout-revision", "4");
    expect(host.measureColumns([])?.layoutRevision).toBe(4);
  });

  it("answers a revision that never matches when the root carries none", () => {
    const root = createRoot(null);
    expect(createDomMeasurementHost(() => root).measureRows([])?.layoutRevision).toBe(-1);
  });
});
