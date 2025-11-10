// packages/react/src/Grid.tsx
import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  ReactElement,
  useMemo,
  isValidElement,
} from "react";
import { GridEngine, attachDomRenderer } from "gp-grid-core";
import type {
  GridOptions,
  CellRendererParams,
  EditRendererParams,
  HeaderRendererParams,
} from "gp-grid-core";
import "./Grid.css";
import PortalManager from "./PortalManager";

// React renderer types
type ReactCellRenderer = (params: CellRendererParams) => React.ReactNode;
type ReactEditRenderer = (params: EditRendererParams) => React.ReactNode;
type ReactHeaderRenderer = (params: HeaderRendererParams) => React.ReactNode;

export interface GridProps
  extends Omit<
    GridOptions,
    | "cellRenderer"
    | "editRenderer"
    | "headerRenderer"
    | "cellRenderers"
    | "editRenderers"
    | "headerRenderers"
  > {
  cellRenderers?: Record<string, ReactCellRenderer>;
  editRenderers?: Record<string, ReactEditRenderer>;
  headerRenderers?: Record<string, ReactHeaderRenderer>;
  cellRenderer?: ReactCellRenderer;
  editRenderer?: ReactEditRenderer;
  headerRenderer?: ReactHeaderRenderer;
}

export const Grid = (props: GridProps): React.JSX.Element => {
  const {
    cellRenderers,
    editRenderers,
    headerRenderers,
    cellRenderer: globalCellRenderer,
    editRenderer: globalEditRenderer,
    headerRenderer: globalHeaderRenderer,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GridEngine | null>(null);
  const portalManagerRef = useRef<PortalManager>(new PortalManager());
  const containerKeyMapRef = useRef<Map<HTMLElement, string>>(new Map());
  const lastParamsRef = useRef<
    Map<
      string,
      {
        value: unknown;
        rowData: unknown;
      }
    >
  >(new Map());
  const cleanupRef = useRef<(() => void) | null>(null);

  const [portals, setPortals] = useState<ReactElement[]>([]);

  useEffect(() => {
    portalManagerRef.current.setUpdateCallback(setPortals);
    // Initial call to render any existing portals
    setPortals(portalManagerRef.current.getPortals());
  }, []);


  const wrapReactRenderer = useCallback(
    (
      reactRenderer:
        | ReactCellRenderer
        | ReactEditRenderer
        | ReactHeaderRenderer,
      type: "cell" | "edit" | "header",
    ) => {
      return (container: HTMLElement, params: any) => {
        // Generate simple key
        let key: string;
        if (type === "cell" || type === "edit") {
          key = `${type}-${params.rowIndex}-${params.colIndex}`;
        } else {
          key = `header-${params.colIndex}`;
        }

        const manager = portalManagerRef.current;
        const containerKeyMap = containerKeyMapRef.current;
        const lastParamsMap = lastParamsRef.current;

        const previousKey = containerKeyMap.get(container);
        const hasPortal = manager.hasPortal(key);
        const lastParams = lastParamsMap.get(key);

        const valueChanged =
          !lastParams || !Object.is(lastParams.value, params.value);
        const rowDataChanged =
          !lastParams || lastParams.rowData !== params.rowData;
        const needsNewPortal = !hasPortal;
        const containerMoved = previousKey !== undefined && previousKey !== key;
        const shouldUpdate = needsNewPortal || valueChanged || rowDataChanged || containerMoved;

        const content = reactRenderer(params);
        if (content === null || content === undefined) {
          // Renderer returned nothing; remove existing portal if this container owns it
          if (previousKey === key) {
            manager.removePortal(key);
            containerKeyMap.delete(container);
            lastParamsMap.delete(key);
          }
          return () => {};
        }

          const element = isValidElement(content) ? content : <>{content}</>;
        const wrappedElement = <div className={`${type}-wrapper`}>{element}</div>;

        if (shouldUpdate) {
          if (previousKey && previousKey !== key && manager.hasPortal(previousKey)) {
            manager.recyclePortal(previousKey, key, wrappedElement);
            lastParamsMap.delete(previousKey);
          } else {
            manager.createPortal(key, container, wrappedElement);
          }

          containerKeyMap.set(container, key);
          lastParamsMap.set(key, {
            value: params.value,
            rowData: params.rowData,
          });
        } else if (!previousKey) {
          // Portal already exists for this key; ensure mapping is recorded
          containerKeyMap.set(container, key);
        }

          if (type === "edit") {
            setTimeout(() => {
              const input = container.querySelector(
                "input, textarea, select",
              ) as HTMLElement;
              input?.focus();
            }, 0);
          }

          const cleanup = () => {
          const currentKey = containerKeyMap.get(container);
          if (currentKey === key) {
            manager.removePortal(key);
            containerKeyMap.delete(container);
            lastParamsMap.delete(key);
          }
        };

          return cleanup;
      };
    },
    [],
  );

  const engineCellRenderers = useMemo(() => {
    const renderers: Record<string, any> = {};
    if (cellRenderers) {
      Object.entries(cellRenderers).forEach(([name, renderer]) => {
        renderers[name] = wrapReactRenderer(renderer, "cell");
      });
    }
    return renderers;
  }, [cellRenderers, wrapReactRenderer]);

  const engineEditRenderers = useMemo(() => {
    const renderers: Record<string, any> = {};
    if (editRenderers) {
      Object.entries(editRenderers).forEach(([name, renderer]) => {
        renderers[name] = wrapReactRenderer(renderer, "edit");
      });
    }
    return renderers;
  }, [editRenderers, wrapReactRenderer]);

  const engineHeaderRenderers = useMemo(() => {
    const renderers: Record<string, any> = {};
    if (headerRenderers) {
      Object.entries(headerRenderers).forEach(([name, renderer]) => {
        renderers[name] = wrapReactRenderer(renderer, "header");
      });
    }
    return renderers;
  }, [headerRenderers, wrapReactRenderer]);

  const engineGlobalCellRenderer = useMemo(() => {
    if (globalCellRenderer) {
      return wrapReactRenderer(globalCellRenderer, "cell");
    }
    return undefined;
  }, [globalCellRenderer, wrapReactRenderer]);

  const engineGlobalEditRenderer = useMemo(() => {
    if (globalEditRenderer) {
      return wrapReactRenderer(globalEditRenderer, "edit");
    }
    return undefined;
  }, [globalEditRenderer, wrapReactRenderer]);

  const engineGlobalHeaderRenderer = useMemo(() => {
    if (globalHeaderRenderer) {
      return wrapReactRenderer(globalHeaderRenderer, "header");
    }
    return undefined;
  }, [globalHeaderRenderer, wrapReactRenderer]);

  // Initialize GridEngine and attach DOM renderer
  useEffect(() => {
    if (!containerRef.current || engineRef.current) return;

    // Pass React renderers through GridOptions
    const engineOptions: GridOptions = {
      cellRenderers: engineCellRenderers,
      editRenderers: engineEditRenderers,
      headerRenderers: engineHeaderRenderers,
      cellRenderer: engineGlobalCellRenderer,
      editRenderer: engineGlobalEditRenderer,
      headerRenderer: engineGlobalHeaderRenderer,
      columns: props.columns,
      rowData: props.rowData,
      rowHeight: props.rowHeight,
    };

    const engine = new GridEngine(engineOptions);
    engineRef.current = engine;

    // Use attachDomRenderer directly - it handles all DOM management!
    cleanupRef.current = attachDomRenderer(containerRef.current, engine);

    return () => {
      cleanupRef.current?.();
      portalManagerRef.current.clearAll();
      containerKeyMapRef.current.clear();
      engineRef.current = null;
      cleanupRef.current = null;
    };
  }, [
    engineCellRenderers,
    engineEditRenderers,
    engineHeaderRenderers,
    engineGlobalCellRenderer,
    engineGlobalEditRenderer,
    engineGlobalHeaderRenderer,
  ]);

  return (
    <>
      <div
        ref={containerRef}
        className="react-grid-viewport"
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "auto",
        }}
      />
      {portals}
    </>
  );
};
