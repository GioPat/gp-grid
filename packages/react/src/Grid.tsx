import React, { useRef, useEffect } from "react";
import { GridEngine } from "gp-grid-core";
import type { GridOptions } from "gp-grid-core";
import { attachDomRenderer } from "gp-grid-core";

export interface GridProps extends GridOptions {}

export const Grid = (props: GridProps): JSX.Element => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const engine = new GridEngine(props);
    const detach = attachDomRenderer(ref.current, engine);
    return () => detach();
  }, [props]);

  return <div ref={ref} style={{ width: "100%", height: "400px" }} />;
};
