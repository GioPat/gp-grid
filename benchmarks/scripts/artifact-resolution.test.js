import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertCandidateArtifactPath,
  assertManifestMatchesCurrentArtifacts,
  collectArtifactProvenance,
  REPOSITORY_ROOT,
} from "./artifact-resolution.js";

test("candidate provenance identifies production files in this checkout", () => {
  const provenance = collectArtifactProvenance("candidate");
  assert.equal(provenance.source, "candidate");
  assert.equal(provenance.buildProfile, "production");
  assert.equal(provenance.packages.length, 2);
  for (const artifact of provenance.packages) {
    assert.ok(artifact.entry.startsWith(REPOSITORY_ROOT));
    assert.ok(artifact.style.startsWith(REPOSITORY_ROOT));
    assert.match(artifact.entrySha256, /^[a-f0-9]{64}$/);
  }
});

test("published provenance resolves the wrapper and its transitive core", () => {
  const provenance = collectArtifactProvenance("published");
  assert.equal(provenance.source, "published");
  assert.deepEqual(
    provenance.packages.map((artifact) => artifact.name),
    ["@gp-grid/core", "@gp-grid/react"],
  );
  for (const artifact of provenance.packages) {
    assert.match(artifact.entry, /node_modules/);
    assert.match(artifact.entrySha256, /^[a-f0-9]{64}$/);
  }
});

test("candidate provenance rejects an artifact outside this checkout", () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "gp-grid-artifact-"));
  const file = path.join(outside, "index.js");
  fs.writeFileSync(file, "export {};\n");
  assert.throws(() => assertCandidateArtifactPath(file), /outside this checkout/);
  fs.rmSync(outside, { recursive: true, force: true });
});

test("candidate provenance rejects a manifest for different artifacts", () => {
  const originalSource = process.env.BENCH_SOURCE;
  process.env.BENCH_SOURCE = "candidate";
  try {
    const artifacts = collectArtifactProvenance("candidate");
    const mismatched = structuredClone(artifacts);
    mismatched.packages[0].entrySha256 = "0".repeat(64);
    assert.throws(
      () => assertManifestMatchesCurrentArtifacts({ artifacts: mismatched }),
      /different gp-grid artifacts/,
    );
  } finally {
    if (originalSource === undefined) {
      delete process.env.BENCH_SOURCE;
    } else {
      process.env.BENCH_SOURCE = originalSource;
    }
  }
});
