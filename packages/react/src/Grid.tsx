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

  // State to track portal renders - use Map for O(1) updates
  const [portals, setPortals] = React.useState<
    Map<string, { container: HTMLElement; content: React.ReactNode }>
  >(new Map());

  // Memoization: track previous render params to avoid unnecessary portal updates
  const portalParamsRef = useRef<Map<string, { value: unknown; rowIndex?: number; colIndex?: number }>>(new Map());

  // Stable container ID counter - each DOM container gets a unique ID that persists across recycling
  const containerIdCounter = useRef<number>(0);
  const getContainerId = (container: HTMLElement): string => {
    if (!container.dataset.portalId) {
      container.dataset.portalId = `portal-${containerIdCounter.current++}`;
    }
    return container.dataset.portalId;
  };

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
        // Use stable container-based ID instead of row-col position
        // This prevents portal destruction when cells are recycled to show different data
        const id = getContainerId(container);

        // Check if params have changed to avoid unnecessary portal updates
        const prevParams = portalParamsRef.current.get(id);
        const hasChanged = !prevParams ||
          prevParams.value !== params.value ||
          prevParams.rowIndex !== params.rowIndex ||
          prevParams.colIndex !== params.colIndex;

        if (hasChanged) {
          // Update memoization cache
          portalParamsRef.current.set(id, {
            value: params.value,
            rowIndex: params.rowIndex,
            colIndex: params.colIndex,
          });

          // Render new content and update portal SYNCHRONOUSLY
          // This ensures portal content updates in sync with core engine's position changes
          const rawContent = reactRenderer(params);
          // Wrap content in a constraining div to prevent overflow
          // Background color matches cell background to avoid flashing during scroll
          const content = (
            <div style={{
              width: '100%',
              height: '100%',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              minWidth: 0,
              flexShrink: 1,
              backgroundColor: '#FAFAFA'
            }}>
              {rawContent}
            </div>
          );
          flushSync(() => {
            setPortals((prev) => {
              const next = new Map(prev);
              next.set(id, { container, content });
              return next;
            });
          });
        }

        // Don't return a cleanup function!
        // Portals should persist as long as the container exists.
        // They'll be cleaned up when the component unmounts or when we detect hidden containers.
        return undefined;
      };
    };

    const wrapEditRenderer = (reactRenderer: (params: EditRendererParams) => React.ReactNode) => {
      return (container: HTMLElement, params: EditRendererParams) => {
        // Edit uses a stable container, so we can use a fixed ID
        const id = getContainerId(container);

        // Check if params have changed (for edit, we always update since it's a single active cell)
        const prevParams = portalParamsRef.current.get(id);
        const hasChanged = !prevParams ||
          prevParams.value !== params.value ||
          prevParams.rowIndex !== params.rowIndex ||
          prevParams.colIndex !== params.colIndex;

        if (hasChanged) {
          // Update memoization cache
          portalParamsRef.current.set(id, {
            value: params.value,
            rowIndex: params.rowIndex,
            colIndex: params.colIndex,
          });

          // Render new content and update portal SYNCHRONOUSLY
          const rawContent = reactRenderer(params);
          // Wrap content in a constraining div to prevent overflow
          // Background color matches cell background to avoid flashing during scroll
          const content = (
            <div style={{
              width: '100%',
              height: '100%',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              minWidth: 0,
              flexShrink: 1,
              backgroundColor: '#FAFAFA'
            }}>
              {rawContent}
            </div>
          );
          flushSync(() => {
            setPortals((prev) => {
              const next = new Map(prev);
              next.set(id, { container, content });
              return next;
            });
          });
        }

        return undefined;
      };
    };

    const wrapHeaderRenderer = (reactRenderer: (params: HeaderRendererParams) => React.ReactNode) => {
      return (container: HTMLElement, params: HeaderRendererParams) => {
        // Use stable container-based ID for headers too
        const id = getContainerId(container);

        // For headers, track sort state changes
        const sortKey = `${params.sortDirection}-${params.sortIndex}`;
        const prevParams = portalParamsRef.current.get(id);
        const hasChanged = !prevParams ||
          prevParams.value !== sortKey ||
          prevParams.colIndex !== params.colIndex;

        if (hasChanged) {
          // Update memoization cache
          portalParamsRef.current.set(id, {
            value: sortKey,
            colIndex: params.colIndex,
          });

          // Render new content and update portal SYNCHRONOUSLY
          const rawContent = reactRenderer(params);
          // Wrap content in a constraining div to prevent overflow
          // Background color matches cell background to avoid flashing during scroll
          const content = (
            <div style={{
              width: '100%',
              height: '100%',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              minWidth: 0,
              flexShrink: 1,
              backgroundColor: '#FAFAFA'
            }}>
              {rawContent}
            </div>
          );
          flushSync(() => {
            setPortals((prev) => {
              const next = new Map(prev);
              next.set(id, { container, content });
              return next;
            });
          });
        }

        return undefined;
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
      setPortals(new Map());
      portalParamsRef.current.clear();
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

  // Cleanup portals for hidden containers periodically
  // Use requestIdleCallback or a less frequent interval to avoid blocking scroll
  useEffect(() => {
    let timeoutId: number;

    const cleanupHiddenPortals = () => {
      setPortals((prev) => {
        const next = new Map(prev);
        let changed = false;

        for (const [id, { container }] of prev.entries()) {
          if (!container.isConnected || container.style.display === 'none') {
            next.delete(id);
            portalParamsRef.current.delete(id);
            changed = true;
          }
        }

        return changed ? next : prev;
      });

      // Schedule next cleanup after a delay to avoid running on every render
      timeoutId = window.setTimeout(cleanupHiddenPortals, 100);
    };

    // Start the cleanup loop
    timeoutId = window.setTimeout(cleanupHiddenPortals, 100);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

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
      {Array.from(portals.entries()).map(([id, { container, content }]) => {
        // Defensive check: only create portal if container is visible and in the DOM
        try {
          if (container && container.isConnected && container.style.display !== 'none') {
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
