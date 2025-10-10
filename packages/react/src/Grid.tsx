import React, { useRef, useEffect } from "react";
import { GridEngine } from "gp-grid-core";
import type { GridOptions } from "gp-grid-core";
import { attachDomRenderer } from "gp-grid-core";

export interface GridProps extends GridOptions {}

export const Grid = (props: GridProps): JSX.Element => {
  const ref = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GridEngine | null>(null);

  // Effect 1: Create engine once on mount
  useEffect(() => {
    if (!ref.current || engineRef.current) return;

    engineRef.current = new GridEngine(props);
    const detach = attachDomRenderer(ref.current, engineRef.current);

    return () => {
      detach();
      engineRef.current = null;
    };
  }, []); // Run only once

  // Effect 2: Update row data when it changes
  useEffect(() => {
    if (engineRef.current && props.rowData) {
      engineRef.current.updateRowData(props.rowData);
    }
  }, [props.rowData]);

  return <div ref={ref} style={{ width: "100%", height: "400px" }} />;
};
