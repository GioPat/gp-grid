// src/renderers/domRenderer.ts
import type { GridEngine, CellInfo } from "../GridEngine";

export function attachDomRenderer(container: HTMLElement, engine: GridEngine) {
  // style container
  container.style.position = "relative";
  container.style.overflow = "auto";

  // big inner content to make scrollbar correct
  const inner = document.createElement("div");
  inner.style.position = "relative";
  inner.style.width = engine.totalWidth + "px";
  inner.style.height = engine.totalHeight + "px";
  inner.style.overflow = "auto";
  container.appendChild(inner);

  const cellPool: HTMLDivElement[] = [];

  engine.onRender((cells: CellInfo[]) => {
    // ensure pool size
    while (cellPool.length < cells.length) {
      const cell = document.createElement("div");
      cell.style.position = "absolute";
      cell.style.border = "1px solid #ddd";
      cell.style.boxSizing = "border-box";
      inner.appendChild(cell);
      cellPool.push(cell);
    }
    // update cell positions & content
    cells.forEach((c, i) => {
      const cell = cellPool[i];
      cell!.style.left = c.x + "px";
      cell!.style.top = c.y + "px";
      cell!.style.width = c.width + "px";
      cell!.style.height = c.height + "px";
      cell!.textContent = String(c.value ?? "");
    });
  });

  const update = () => {
    const rect = container.getBoundingClientRect();
    engine.computeVisible(
      container.scrollTop,
      container.scrollLeft,
      rect.width,
      rect.height,
    );
  };

  container.addEventListener("scroll", update);
  window.addEventListener("resize", update);
  update();

  return () => {
    container.removeEventListener("scroll", update);
    window.removeEventListener("resize", update);
    container.innerHTML = "";
  };
}
