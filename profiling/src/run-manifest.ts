// run.json: what was profiled and on what machine, so a results directory is
// self-describing and the report can find the served assets' source maps.

import { execSync } from "node:child_process";
import os from "node:os";
import { REPO_ROOT, type CaptureMode, type FrameworkId, type ScenarioId } from "./config";

export interface RunManifest {
  createdAt: string;
  framework: FrameworkId;
  rows: number;
  scenarios: ScenarioId[];
  captures: CaptureMode[];
  iterations: number;
  baseUrl: string;
  /** false when --url pointed at an externally running server. */
  served: boolean;
  /** Built assets root used to resolve source maps (only meaningful when served). */
  distDir: string;
  chromeVersion: string;
  node: string;
  platform: string;
  cpu: string;
  git: { sha: string | null; dirty: boolean | null };
}

type ManifestInput = Omit<RunManifest, "createdAt" | "node" | "platform" | "cpu" | "git">;

const git = (args: string): string | null => {
  try {
    return execSync(`git ${args}`, { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
};

export const buildRunManifest = (input: ManifestInput): RunManifest => {
  const status = git("status --porcelain");
  return {
    createdAt: new Date().toISOString(),
    ...input,
    node: process.version,
    platform: `${os.platform()} ${os.release()} (${os.arch()})`,
    cpu: os.cpus()[0]?.model ?? "unknown",
    git: { sha: git("rev-parse HEAD"), dirty: status === null ? null : status.length > 0 },
  };
};
