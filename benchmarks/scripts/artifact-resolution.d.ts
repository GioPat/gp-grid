import type { ArtifactProvenance, RunManifest } from "../src/data/types";

interface GpGridAlias {
  find: string | RegExp;
  replacement: string;
}

export const BENCHMARKS_ROOT: string;
export const REPOSITORY_ROOT: string;
export const readBenchmarkSource: () => "candidate" | "published";
export const collectArtifactProvenance: (source?: "candidate" | "published") => ArtifactProvenance;
export const getGpGridAliases: (source?: "candidate" | "published") => GpGridAlias[];
export const assertCandidateArtifactPath: (filePath: string, repositoryRoot?: string) => string;
export const assertManifestMatchesCurrentArtifacts: (manifest: RunManifest) => ArtifactProvenance;
