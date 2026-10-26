// benchmarks/demo/stage.ts
// The recording's stage: hides everything but the grid shell, frames it on a
// backdrop that matches gridcast's cards, and adds the fake cursor (headless
// videos do not render the real one) and the caption pill.

import type { Page } from "@playwright/test";

const FONT_URL = "/__gridcast-font";

const FONT_TYPES: Record<string, string> = { woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf" };

/** Serve GRIDCAST_FONT (set by gridcast) so the grid and captions match the cards. */
const routeFont = async (page: Page): Promise<boolean> => {
  const font = process.env.GRIDCAST_FONT;
  if (font === undefined || font === "") return false;
  const type = FONT_TYPES[font.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
  await page.route(`**${FONT_URL}`, (route) => route.fulfill({ path: font, contentType: type }));
  return true;
};

const css = (padding: number, customFont: boolean): string => `
  ${customFont ? `@font-face { font-family: "DemoFont"; src: url("${FONT_URL}"); font-weight: 100 900; font-display: block; }` : ""}
  :root {
    --demo-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
    --demo-accent: #60a5fa;
    --demo-font: ${customFont ? "DemoFont, " : ""}Inter, system-ui, sans-serif;
  }
  html, body, #root {
    overflow: hidden !important;
    background:
      radial-gradient(55% 60% at 50% -10%, rgba(96, 165, 250, .16), transparent 70%),
      #0b1220 !important;
    -webkit-font-smoothing: antialiased;
  }
  #root * { visibility: hidden; }
  #root .demo-grid-shell, #root .demo-grid-shell * { visibility: visible; }
  .demo-grid-shell, .demo-grid-shell .gp-grid-container { font-family: var(--demo-font) !important; }
  .demo-grid-shell {
    position: fixed !important; inset: ${padding}px !important;
    width: auto !important; height: auto !important; margin: 0 !important;
    border-radius: 12px; overflow: hidden;
    box-shadow: 0 0 0 1px rgba(148, 163, 184, .16), 0 24px 64px rgba(0, 0, 0, .55);
    z-index: 1000;
  }
  .demo-cursor {
    position: fixed; left: 0; top: 0; width: 22px; height: 22px;
    pointer-events: none; z-index: 2147483647;
    transform: translate(-3px, -2px);
    transition: transform 120ms var(--demo-ease-out);
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, .6));
  }
  .demo-cursor.down { transform: translate(-3px, -2px) scale(.86); }
  .demo-ripple {
    position: fixed; width: 34px; height: 34px; border-radius: 50%;
    border: 2px solid var(--demo-accent); pointer-events: none; z-index: 2147483646;
    transform: translate(-50%, -50%) scale(.5); opacity: .9;
    animation: demo-ripple 520ms var(--demo-ease-out) forwards;
  }
  @keyframes demo-ripple { to { transform: translate(-50%, -50%) scale(1.35); opacity: 0; } }
  .demo-caption {
    position: fixed; left: 50%; bottom: ${padding + 20}px;
    display: flex; align-items: center; gap: 10px;
    padding: 11px 20px 11px 16px; border-radius: 999px;
    background: rgba(11, 18, 32, .72);
    -webkit-backdrop-filter: blur(16px) saturate(160%); backdrop-filter: blur(16px) saturate(160%);
    border: 1px solid rgba(148, 163, 184, .22);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .06), 0 12px 32px rgba(0, 0, 0, .45);
    color: #f1f5f9;
    font: 600 17px/1.3 var(--demo-font); letter-spacing: -.005em;
    white-space: nowrap; z-index: 2147483645;
    opacity: 0; filter: blur(4px);
    transform: translate(-50%, 10px) scale(.97);
    transition: opacity 320ms var(--demo-ease-out), transform 320ms var(--demo-ease-out), filter 320ms var(--demo-ease-out);
  }
  .demo-caption::before {
    content: ""; width: 7px; height: 7px; border-radius: 50%;
    background: var(--demo-accent); box-shadow: 0 0 10px var(--demo-accent);
  }
  .demo-caption.show { opacity: 1; filter: none; transform: translate(-50%, 0) scale(1); }
`;

/** Runs in the page before any of its scripts. */
const mount = ({ style, swapMs }: { style: string; swapMs: number }): void => {
  const ready = (): void => {
    const sheet = document.createElement("style");
    sheet.textContent = style;
    (document.head ?? document.documentElement).appendChild(sheet);
    const cursor = document.createElement("div");
    cursor.className = "demo-cursor";
    cursor.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 3l14 8.5-6.2 1.6L9.5 19 5 3z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.body.appendChild(cursor);
    const caption = document.createElement("div");
    caption.className = "demo-caption";
    document.body.appendChild(caption);
    // Pointer events, not mouse events: once the grid captures the pointer
    // (fill drag, column drag) the browser stops emitting mousemove.
    window.addEventListener("pointermove", (event) => {
      cursor.style.left = `${event.clientX}px`;
      cursor.style.top = `${event.clientY}px`;
    }, true);
    window.addEventListener("pointerdown", (event) => {
      cursor.classList.add("down");
      const ripple = document.createElement("div");
      ripple.className = "demo-ripple";
      ripple.style.left = `${event.clientX}px`;
      ripple.style.top = `${event.clientY}px`;
      document.body.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    }, true);
    window.addEventListener("pointerup", () => cursor.classList.remove("down"), true);

    let pending = 0;
    (window as unknown as { __demoCaption: (text: string) => void }).__demoCaption = (text) => {
      window.clearTimeout(pending);
      if (text === "") {
        caption.classList.remove("show");
        return;
      }
      if (caption.classList.contains("show") === false) {
        caption.textContent = text;
        caption.classList.add("show");
        return;
      }
      // Swapping text on a visible pill reads as a glitch: let it leave, then return.
      caption.classList.remove("show");
      pending = window.setTimeout(() => {
        caption.textContent = text;
        caption.classList.add("show");
      }, swapMs);
    };
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
  else ready();
};

export const installStage = async (page: Page, padding: number): Promise<void> => {
  const customFont = await routeFont(page);
  await page.addInitScript(mount, { style: css(padding, customFont), swapMs: 200 });
};
