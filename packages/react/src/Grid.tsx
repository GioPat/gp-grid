import React, { useRef, useEffect } from "react";
import { GridEngine } from "gp-grid-core";
import type { GridOptions } from "gp-grid-core";
import { attachDomRenderer } from "gp-grid-core";

export interface GridProps extends GridOptions {}

export const Grid = (props: GridProps): JSX.Element => {
  const ref = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GridEngine | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    // Create engine only once
    if (!engineRef.current) {
      engineRef.current = new GridEngine(props);
      const detach = attachDomRenderer(ref.current, engineRef.current);
      return () => {
        detach();
        engineRef.current = null;
      };
    }
  }, [props.columns, props.rowData, props.rowHeight, props.headerHeight]);

  return <div ref={ref} style={{ width: "100%", height: "400px" }} />;
};
