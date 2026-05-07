import { describe, expect, it } from "vitest";
import { toPointerEventData } from "../src/adapter/pointer-event";

describe("toPointerEventData", () => {
  it("converts a DOM PointerEvent to core pointer event data", () => {
    const event = new PointerEvent("pointerdown", {
      clientX: 12,
      clientY: 34,
      button: 1,
      shiftKey: true,
      ctrlKey: true,
      metaKey: true,
      pointerId: 9,
      pointerType: "pen",
    });

    expect(toPointerEventData(event)).toEqual({
      clientX: 12,
      clientY: 34,
      button: 1,
      shiftKey: true,
      ctrlKey: true,
      metaKey: true,
      pointerId: 9,
      pointerType: "pen",
    });
  });
});
