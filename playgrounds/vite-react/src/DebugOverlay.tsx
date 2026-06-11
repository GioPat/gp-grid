// TEMPORARY diagnostic overlay for the touch-scroll work. Remove before 1.0.
// Shows, live from the device: which bundle is running, the actual scroll
// speed (rows/s), and how far the rendered rows lag behind the scroll
// position. Reads the gp-grid DOM directly (wrapper → sizer → scroller).

import { useEffect, useState } from "react";

export const TOUCH_DEBUG_BUILD = "touch-v6-governor";

interface Stats {
  bound: string;
  rowSpeed: number;
  maxRowSpeed: number;
  impliedRow: number;
  drawnRow: number | null;
  lagRows: number | null;
  maxLagRows: number;
}

const parseTranslateY = (el: HTMLElement): number => {
  const match = /translateY\((-?[\d.]+)px\)/.exec(el.style.transform);
  return match ? Number.parseFloat(match[1]) : 0;
};

const parseRowId = (row: HTMLElement): number | null => {
  const text = row.firstElementChild?.textContent?.trim() ?? "";
  const match = /\d+/.exec(text);
  return match ? Number.parseInt(match[0], 10) : null;
};

/** Id (0-based row index) of the topmost rendered row in the viewport. */
const readDrawnRow = (
  wrapper: HTMLElement,
  scrollTop: number,
): number | null => {
  const wrapperOffset = parseTranslateY(wrapper);
  let bestId: number | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const row of wrapper.querySelectorAll<HTMLElement>(".gp-grid-row")) {
    const absY = wrapperOffset + parseTranslateY(row);
    const delta = Math.abs(absY - scrollTop);
    if (delta < bestDelta) {
      const id = parseRowId(row);
      if (id !== null) {
        bestDelta = delta;
        bestId = id - 1; // playground ids are rowIndex + 1
      }
    }
  }
  return bestId;
};

export function DebugOverlay({ totalRows }: { totalRows: number }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    console.log(`[gp-grid debug] build: ${TOUCH_DEBUG_BUILD}`);
    let lastT = performance.now();
    let lastTop = 0;
    let maxRowSpeed = 0;
    let maxLagRows = 0;
    let raf = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const wrapper = document.querySelector<HTMLElement>(
        ".gp-grid-rows-wrapper",
      );
      const scroller = wrapper?.parentElement?.parentElement ?? null;
      if (wrapper === null || scroller === null) return;
      const dt = now - lastT;
      if (dt < 200) return; // sample ~5x/s to keep the overlay itself cheap

      const top = scroller.scrollTop;
      const range = scroller.scrollHeight - scroller.clientHeight;
      const rowsPerDomPx = range > 0 ? totalRows / range : 0;
      const rowSpeed = Math.abs(((top - lastTop) / dt) * 1000) * rowsPerDomPx;
      lastT = now;
      lastTop = top;
      maxRowSpeed = Math.max(maxRowSpeed * 0.98, rowSpeed);

      const impliedRow = top * rowsPerDomPx;
      const drawnRow = readDrawnRow(wrapper, top);
      const lagRows =
        drawnRow === null ? null : Math.abs(impliedRow - drawnRow);
      if (lagRows !== null) maxLagRows = Math.max(maxLagRows * 0.98, lagRows);

      setStats({
        bound: `sh=${Math.round(scroller.scrollHeight / 1000)}k ch=${scroller.clientHeight}`,
        rowSpeed,
        maxRowSpeed,
        impliedRow,
        drawnRow,
        lagRows,
        maxLagRows,
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [totalRows]);

  return (
    <div
      style={{
        position: "fixed",
        top: 4,
        right: 4,
        zIndex: 9999,
        background: "rgba(0,0,0,0.8)",
        color: "#0f0",
        font: "11px/1.5 monospace",
        padding: "6px 8px",
        borderRadius: 4,
        pointerEvents: "none",
        textAlign: "left",
        whiteSpace: "pre",
      }}
    >
      {`build: ${TOUCH_DEBUG_BUILD}
bound: ${stats?.bound ?? "searching…"}
speed: ${stats ? stats.rowSpeed.toFixed(0) : "-"} rows/s (max ${stats ? stats.maxRowSpeed.toFixed(0) : "-"})
scroll row: ${stats ? stats.impliedRow.toFixed(0) : "-"}
drawn row: ${stats?.drawnRow ?? "-"}
lag: ${stats?.lagRows?.toFixed(0) ?? "-"} rows (max ${stats ? stats.maxLagRows.toFixed(0) : "-"})`}
    </div>
  );
}
