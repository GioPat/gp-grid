// benchmarks/scripts/demo-server.mjs
// Serves the built React playground for the demo recordings (gridcast).
// Same static server as conformance-server.mjs, but only the React fixture:
// the demo videos are recorded once, not per framework.

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = Number(process.env.DEMO_PORT ?? 5300);
const root = path.join(repositoryRoot, "playgrounds/vite-react/dist");
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".woff2", "font/woff2"],
]);

if (fs.existsSync(path.join(root, "index.html")) === false) {
  throw new Error(`Demo fixture is not built: ${root} (run: pnpm --filter vite-react exec vite build)`);
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const candidate = path.resolve(root, relative || "index.html");
  const file = candidate.startsWith(`${path.resolve(root)}${path.sep}`) && fs.existsSync(candidate)
    ? candidate
    : path.join(root, "index.html");
  response.setHeader("Content-Type", contentTypes.get(path.extname(file)) ?? "application/octet-stream");
  response.end(fs.readFileSync(file));
});
server.listen(port, "127.0.0.1", () => console.log(`Demo fixture: http://127.0.0.1:${port}`));

const close = () => server.close();
process.on("SIGINT", close);
process.on("SIGTERM", close);
