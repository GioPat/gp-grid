import type { GridViewportApi, ScrollMotionHandle } from "../src/grid-core-viewport";

type MotionSlot = Pick<
  GridViewportApi,
  | "isScrollMotionActive"
  | "interruptScrollMotion"
  | "setScrollMotionHandle"
  | "clearScrollMotionHandle"
>;

/** The viewport's scroll-motion members, for mocked cores. */
export const createMotionSlot = (): MotionSlot => {
  let motion: ScrollMotionHandle | null = null;
  return {
    isScrollMotionActive: () => motion?.isActive() === true,
    interruptScrollMotion: () => motion?.interrupt(),
    setScrollMotionHandle: (handle) => {
      motion = handle;
    },
    clearScrollMotionHandle: (handle) => {
      if (motion === handle) motion = null;
    },
  };
};
