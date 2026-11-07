// packages/core/tests/fixed-origin.test.ts

import { afterEach, describe, expect, it, vi } from "vitest";
import { readFixedOrigin } from "../src/adapter/fixed-origin";
import { calculateFilterPopupPosition } from "../src/utils/popup-position";

const rect = (left: number, top: number, width = 0, height = 0): DOMRect =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

// Simulates a transformed ancestor: a fixed element at top:0/left:0 lands at (originLeft, originTop).
const stubLayout = (originLeft: number, originTop: number, rects: Map<Element, DOMRect>): void => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.style.position === "fixed" && this.style.top === "0px") return rect(originLeft, originTop);
    return rects.get(this) ?? rect(0, 0);
  });
};

const mount = (): { host: HTMLElement; popup: HTMLElement; header: HTMLElement } => {
  const host = document.createElement("div");
  const popup = document.createElement("div");
  const header = document.createElement("div");
  host.append(popup, header);
  document.body.append(host);
  return { host, popup, header };
};

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("readFixedOrigin", () => {
  it("measures the fixed containing block inside the host and leaves no probe behind", () => {
    const { host } = mount();
    stubLayout(120, 80, new Map());

    expect(readFixedOrigin(host)).toEqual({ top: 80, left: 120 });
    expect(host.children).toHaveLength(2);
  });

  it("is the viewport origin without a containing ancestor", () => {
    const { host } = mount();
    stubLayout(0, 0, new Map());

    expect(readFixedOrigin(host)).toEqual({ top: 0, left: 0 });
  });
});

describe("calculateFilterPopupPosition", () => {
  it("returns coordinates relative to the fixed containing block", () => {
    const { popup, header } = mount();
    stubLayout(120, 80, new Map([[header, rect(300, 200, 150, 30)], [popup, rect(0, 0, 200, 100)]]));

    expect(calculateFilterPopupPosition(header, popup)).toEqual({ top: 230 + 4 - 80, left: 300 - 120, minWidth: 200 });
  });
});
