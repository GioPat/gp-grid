// Builds and serves a playground's profiling build by spawning the
// playground's own tooling (`pnpm exec vite build --mode profiling`,
// `pnpm exec vite preview`). Nothing here knows about frameworks; the target
// supplies the commands.

import { spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import type { FrameworkTarget } from "./config";

const isWindows = process.platform === "win32";
const SERVER_READY_TIMEOUT_MS = 60_000;

const spawnPnpm = (args: string[], cwd: string, quiet: boolean): ChildProcess => {
  const stdio: StdioOptions = quiet ? ["ignore", "ignore", "inherit"] : "inherit";
  // pnpm is a .cmd shim on Windows, which Node refuses to spawn without a
  // shell; go through the shell with a single command string there. The
  // arguments are fixed tokens from config.ts, never user input.
  if (isWindows) {
    return spawn(["pnpm", "exec", ...args].join(" "), [], { cwd, shell: true, stdio });
  }
  return spawn("pnpm", ["exec", ...args], { cwd, stdio });
};

const killTree = (child: ChildProcess): void => {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (isWindows) {
    // With shell:true, child.kill() only stops the shell; take the tree down.
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  child.kill("SIGTERM");
};

export const buildPlayground = (target: FrameworkTarget): Promise<void> =>
  new Promise((resolve, reject) => {
    console.log(`[profiling] building ${target.label} playground (${target.buildArgs.join(" ")})`);
    const child = spawnPnpm(target.buildArgs, target.playgroundDir, false);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`build failed with exit code ${code}`));
    });
  });

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const waitForHttp = async (url: string, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  throw new Error(`server at ${url} did not become ready within ${timeoutMs} ms`);
};

export interface ServerHandle {
  baseUrl: string;
  stop: () => void;
}

export const servePlayground = async (
  target: FrameworkTarget,
): Promise<ServerHandle> => {
  const baseUrl = `http://127.0.0.1:${target.port}`;
  console.log(`[profiling] serving ${target.label} playground at ${baseUrl}`);
  const child = spawnPnpm(target.serveArgs(target.port), target.playgroundDir, true);
  const stop = (): void => killTree(child);
  process.once("exit", stop);
  try {
    await waitForHttp(`${baseUrl}/`, SERVER_READY_TIMEOUT_MS);
  } catch (error) {
    stop();
    throw error;
  }
  return { baseUrl, stop };
};
