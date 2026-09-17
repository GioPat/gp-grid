import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtures = [
  { port: 5200, root: path.join(repositoryRoot, "playgrounds/vite-react/dist") },
  { port: 5201, root: path.join(repositoryRoot, "playgrounds/vite-vue/dist") },
  { port: 5202, root: path.join(repositoryRoot, "playgrounds/angular/dist/conformance-angular/browser") },
];
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

const servers = fixtures.map(({ port, root }) => {
  if (fs.existsSync(path.join(root, "index.html")) === false) {
    throw new Error(`Conformance fixture is not built: ${root}`);
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
  server.listen(port, "127.0.0.1", () => console.log(`Conformance fixture: http://127.0.0.1:${port}`));
  return server;
});

const close = () => {
  for (const server of servers) server.close();
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
