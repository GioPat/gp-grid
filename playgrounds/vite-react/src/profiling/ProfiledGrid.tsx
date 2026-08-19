// React side of the playground profiling hooks (playground-only).
// Wraps the grid in a React.Profiler that records each commit as a
// `react:commit` User Timing measure (visible next to the `gp-grid:*` spans in
// the DevTools Timings track) and attaches window.gridApi once the grid has
// mounted. Renders children untouched unless `?profiling=1`.
//
// React.Profiler is a no-op in production builds unless the app is built with
// the `react-dom/profiling` entry — see vite.config.ts (`--mode profiling`).

import {
  Profiler,
  useEffect,
  type ProfilerOnRenderCallback,
  type ReactNode,
  type RefObject,
} from "react";
import type { GridCore, GridRef } from "@gp-grid/react";
import { attachProfiling, type ProfilingParams } from "./hooks";

const recordCommit: ProfilerOnRenderCallback = (
  _id,
  phase,
  actualDuration,
  _baseDuration,
  startTime,
  commitTime,
) => {
  performance.measure("react:commit", {
    start: startTime,
    end: commitTime,
    detail: { phase, actualDuration },
  });
};

interface ProfiledGridProps<TData> {
  params: ProfilingParams;
  gridRef: RefObject<GridRef<TData> | null>;
  children: ReactNode;
}

export const ProfiledGrid = <TData,>({
  params,
  gridRef,
  children,
}: ProfiledGridProps<TData>) => {
  // Child (Grid) effects run before this one, so the core exists on mount.
  // A later core re-creation is picked up by window.gridApi.isReady().
  useEffect(() => {
    attachProfiling(
      params,
      () => (gridRef.current?.core as GridCore<unknown> | undefined) ?? null,
    );
  }, [params, gridRef]);

  if (params.enabled === false) return <>{children}</>;
  return (
    <Profiler id="gp-grid" onRender={recordCommit}>
      {children}
    </Profiler>
  );
};
