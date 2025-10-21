import React, { useRef, useEffect } from "react";
import { createPortal, flushSync } from "react-dom";
import { GridEngine, attachDomRenderer } from "gp-grid-core";
import type {
  GridOptions,
  CellRendererParams,
  EditRendererParams,
  HeaderRendererParams,
} from "gp-grid-core";
import "./Grid.css";

export interface GridProps
  extends Omit<
    GridOptions,
    "cellRenderer" | "editRenderer" | "headerRenderer" | "cellRenderers" | "editRenderers" | "headerRenderers"
  > {
  // Renderer registries: reusable React renderers referenced by key in column definitions
  cellRenderers?: Record<string, (params: CellRendererParams) => React.ReactNode>;
  editRenderers?: Record<string, (params: EditRendererParams) => React.ReactNode>;
  headerRenderers?: Record<string, (params: HeaderRendererParams) => React.ReactNode>;
  // Global default renderers (for backward compatibility)
  cellRenderer?: (params: CellRendererParams) => React.ReactNode;
  editRenderer?: (params: EditRendererParams) => React.ReactNode;
  headerRenderer?: (params: HeaderRendererParams) => React.ReactNode;
}

export const Grid = (props: GridProps): React.JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GridEngine | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // State to track portal renders
  const [portals, setPortals] = React.useState<
    Array<{
      id: string;
      container: HTMLElement;
      content: React.ReactNode;
    }>
  >([]);

  useEffect(() => {
    if (!containerRef.current) return;

    const {
      cellRenderer,
      editRenderer,
      headerRenderer,
      cellRenderers,
      editRenderers,
      headerRenderers,
      ...coreOptions
    } = props;

    // Helper to wrap React renderer into DOM renderer with portal
    const wrapCellRenderer = (reactRenderer: (params: CellRendererParams) => React.ReactNode) => {
      return (container: HTMLElement, params: CellRendererParams) => {
        const id = `cell-${params.rowIndex}-${params.colIndex}`;
        const content = reactRenderer(params);

        setPortals((prev) => {
          const filtered = prev.filter((p) => p.id !== id);
          return [...filtered, { id, container, content }];
        });

        return () => {
          // Cleanup: remove portal from state synchronously using flushSync
          // This ensures React unmounts the portal immediately before container is reused
          flushSync(() => {
            setPortals((prev) => prev.filter((p) => p.id !== id));
          });
        };
      };
    };

    const wrapEditRenderer = (reactRenderer: (params: EditRendererParams) => React.ReactNode) => {
      return (container: HTMLElement, params: EditRendererParams) => {
        const id = "edit";
        const content = reactRenderer(params);

        setPortals((prev) => {
          const filtered = prev.filter((p) => p.id !== id);
          return [...filtered, { id, container, content }];
        });

        return () => {
          flushSync(() => {
            setPortals((prev) => prev.filter((p) => p.id !== id));
          });
        };
      };
    };

    const wrapHeaderRenderer = (reactRenderer: (params: HeaderRendererParams) => React.ReactNode) => {
      return (container: HTMLElement, params: HeaderRendererParams) => {
        const id = `header-${params.colIndex}`;
        const content = reactRenderer(params);

        setPortals((prev) => {
          const filtered = prev.filter((p) => p.id !== id);
          return [...filtered, { id, container, content }];
        });

        return () => {
          flushSync(() => {
            setPortals((prev) => prev.filter((p) => p.id !== id));
          });
        };
      };
    };

    // Convert React renderer registries to DOM renderer registries
    const domCellRenderers = cellRenderers
      ? Object.fromEntries(
          Object.entries(cellRenderers).map(([key, reactRenderer]) => [
            key,
            wrapCellRenderer(reactRenderer),
          ])
        )
      : undefined;

    const domEditRenderers = editRenderers
      ? Object.fromEntries(
          Object.entries(editRenderers).map(([key, reactRenderer]) => [
            key,
            wrapEditRenderer(reactRenderer),
          ])
        )
      : undefined;

    const domHeaderRenderers = headerRenderers
      ? Object.fromEntries(
          Object.entries(headerRenderers).map(([key, reactRenderer]) => [
            key,
            wrapHeaderRenderer(reactRenderer),
          ])
        )
      : undefined;

    // Create core engine with portal-based custom renderers
    const engine = new GridEngine({
      ...coreOptions,
      // Pass converted renderer registries
      cellRenderers: domCellRenderers,
      editRenderers: domEditRenderers,
      headerRenderers: domHeaderRenderers,
      // Pass global renderers (backward compatibility)
      cellRenderer: cellRenderer ? wrapCellRenderer(cellRenderer) : undefined,
      editRenderer: editRenderer ? wrapEditRenderer(editRenderer) : undefined,
      headerRenderer: headerRenderer ? wrapHeaderRenderer(headerRenderer) : undefined,
    });

    engineRef.current = engine;

    // Attach DOM renderer
    const cleanup = attachDomRenderer(containerRef.current, engine);
    cleanupRef.current = cleanup;

    return () => {
      cleanup();
      setPortals([]);
      engineRef.current = null;
      cleanupRef.current = null;
    };
  }, []); // Only initialize once

  // Update row data when it changes
  useEffect(() => {
    if (engineRef.current && props.rowData) {
      engineRef.current.updateRowData(props.rowData);
    }
  }, [props.rowData]);

  return (
    <>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "400px",
        }}
      />
      {/* Render all portals */}
      {portals.map(({ id, container, content }) => {
        // Defensive check: only create portal if container is still in the DOM
        try {
          if (container && container.isConnected) {
            return createPortal(content, container, id);
          }
        } catch (e) {
          // Silently ignore portal errors (e.g., container removed)
          console.debug('Portal rendering skipped for', id, e);
        }
        return null;
      })}
    </>
  );
};
