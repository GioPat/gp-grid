// gp-grid-core/src/worker-manager.ts
// Manages Web Worker lifecycle for sorting operations

import type { SortDirection, SortModel } from "./types";
import { SORT_WORKER_CODE } from "./sort-worker";
import type {
  SortWorkerRequest,
  SortWorkerResponse,
  SortIndicesRequest,
  SortIndicesResponse,
  SortMultiColumnRequest,
  SortMultiColumnResponse,
  SortStringHashesRequest,
  SortStringHashesResponse,
} from "./sort-worker";

// =============================================================================
// SortWorkerManager
// =============================================================================

/**
 * Manages a Web Worker for sorting large datasets off the main thread.
 * Uses an inline worker (Blob URL) for maximum compatibility across bundlers.
 */
export class SortWorkerManager {
  private worker: Worker | null = null;
  private workerUrl: string | null = null;
  private pendingRequests: Map<
    number,
    {
      resolve: (data: unknown) => void;
      reject: (error: Error) => void;
    }
  > = new Map();
  private nextRequestId: number = 0;
  private isTerminated: boolean = false;

  /**
   * Sort data using a Web Worker.
   * The worker is lazily initialized on first use.
   */
  async sortInWorker<T>(data: T[], sortModel: SortModel[]): Promise<T[]> {
    if (this.isTerminated) {
      throw new Error("SortWorkerManager has been terminated");
    }

    // Lazy initialization
    if (!this.worker) {
      this.initializeWorker();
    }

    const id = this.nextRequestId++;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: resolve as (data: unknown) => void,
        reject,
      });

      const request: SortWorkerRequest = {
        type: "sort",
        id,
        data,
        sortModel,
      };

      this.worker!.postMessage(request);
    });
  }

  /**
   * Sort indices using a Web Worker with Transferable typed arrays.
   * This is much faster than sortInWorker for large datasets because
   * it avoids the serialization overhead of transferring full objects.
   */
  async sortIndices(
    values: number[],
    direction: SortDirection,
  ): Promise<Uint32Array> {
    if (this.isTerminated) {
      throw new Error("SortWorkerManager has been terminated");
    }

    // Lazy initialization
    if (!this.worker) {
      this.initializeWorker();
    }

    const id = this.nextRequestId++;

    // Convert to typed array for efficient transfer
    const valuesArray = new Float64Array(values);

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: resolve as (data: unknown) => void,
        reject,
      });

      const request: SortIndicesRequest = {
        type: "sortIndices",
        id,
        values: valuesArray,
        direction,
      };

      // Transfer the values buffer (zero-copy)
      this.worker!.postMessage(request, [valuesArray.buffer]);
    });
  }

  /**
   * Sort by multiple columns using a Web Worker with Transferable typed arrays.
   * Each column's values are passed as a Float64Array, enabling fast multi-column sorting.
   * @param columns Array of column values (each as number[])
   * @param directions Array of directions for each column ("asc" or "desc")
   */
  async sortMultiColumn(
    columns: number[][],
    directions: SortDirection[],
  ): Promise<Uint32Array> {
    if (this.isTerminated) {
      throw new Error("SortWorkerManager has been terminated");
    }

    // Lazy initialization
    if (!this.worker) {
      this.initializeWorker();
    }

    const id = this.nextRequestId++;

    // Convert to typed arrays for efficient transfer
    const columnArrays = columns.map((col) => new Float64Array(col));
    const directionArray = new Int8Array(
      directions.map((d) => (d === "asc" ? 1 : -1)),
    );

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: resolve as (data: unknown) => void,
        reject,
      });

      const request: SortMultiColumnRequest = {
        type: "sortMultiColumn",
        id,
        columns: columnArrays,
        directions: directionArray,
      };

      // Transfer all column buffers (zero-copy)
      const transferables = columnArrays.map((arr) => arr.buffer);
      transferables.push(directionArray.buffer);
      this.worker!.postMessage(request, transferables);
    });
  }

  /**
   * Sort string values using multiple hash chunks with collision detection.
   * Returns sorted indices and handles hash collisions using localeCompare fallback.
   * @param hashChunks Array of hash chunk arrays (one per chunk, each chunk as Float64Array)
   * @param direction Sort direction ("asc" or "desc")
   * @param originalStrings Original string values for collision fallback
   */
  async sortStringHashes(
    hashChunks: Float64Array[],
    direction: SortDirection,
    originalStrings: string[],
  ): Promise<Uint32Array> {
    if (this.isTerminated) {
      throw new Error("SortWorkerManager has been terminated");
    }

    // Lazy initialization
    if (!this.worker) {
      this.initializeWorker();
    }

    const id = this.nextRequestId++;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (data: unknown) => {
          const response = data as {
            indices: Uint32Array;
            collisionPairs: Uint32Array;
          };
          const { indices, collisionPairs } = response;

          // Handle collisions using localeCompare on original strings
          if (collisionPairs.length > 0) {
            this.resolveCollisions(
              indices,
              collisionPairs,
              originalStrings,
              direction,
            );
          }

          resolve(indices);
        },
        reject,
      });

      const request: SortStringHashesRequest = {
        type: "sortStringHashes",
        id,
        hashChunks,
        direction,
      };

      // Transfer all hash chunk buffers (zero-copy)
      const transferables = hashChunks.map((arr) => arr.buffer);
      this.worker!.postMessage(request, transferables);
    });
  }

  /**
   * Resolve hash collisions by re-sorting collision groups using localeCompare.
   */
  private resolveCollisions(
    indices: Uint32Array,
    collisionPairs: Uint32Array,
    originalStrings: string[],
    direction: SortDirection,
  ): void {
    // Build collision groups from pairs
    // collisionPairs contains pairs: [a1, b1, a2, b2, ...]
    // We need to find consecutive runs of equal-hash elements in the sorted indices

    // Create a set of indices that are involved in collisions
    const collisionIndices = new Set<number>();
    for (let i = 0; i < collisionPairs.length; i++) {
      collisionIndices.add(collisionPairs[i]!);
    }

    if (collisionIndices.size === 0) return;

    // Find collision groups in the sorted indices array
    const groups: { start: number; end: number }[] = [];
    let groupStart = -1;

    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i]!;
      if (collisionIndices.has(idx)) {
        if (groupStart === -1) {
          groupStart = i;
        }
      } else {
        if (groupStart !== -1) {
          groups.push({ start: groupStart, end: i });
          groupStart = -1;
        }
      }
    }
    // Handle group at the end
    if (groupStart !== -1) {
      groups.push({ start: groupStart, end: indices.length });
    }

    // Sort each collision group using localeCompare
    const mult = direction === "asc" ? 1 : -1;
    for (const group of groups) {
      // Extract the slice of indices for this group
      const slice = Array.from(indices.slice(group.start, group.end));

      // Sort by original strings
      slice.sort((a, b) => {
        return mult * originalStrings[a]!.localeCompare(originalStrings[b]!);
      });

      // Write back
      for (let i = 0; i < slice.length; i++) {
        indices[group.start + i] = slice[i]!;
      }
    }
  }

  /**
   * Initialize the worker using an inline Blob URL.
   * This works without bundler-specific configuration.
   */
  private initializeWorker(): void {
    // Check if Web Workers are available
    if (typeof Worker === "undefined") {
      throw new Error("Web Workers are not available in this environment");
    }

    // Create Blob URL from inline worker code
    const blob = new Blob([SORT_WORKER_CODE], {
      type: "application/javascript",
    });
    this.workerUrl = URL.createObjectURL(blob);
    this.worker = new Worker(this.workerUrl);

    // Handle messages from worker
    this.worker.onmessage = (
      e: MessageEvent<
        | SortWorkerResponse
        | SortIndicesResponse
        | SortMultiColumnResponse
        | SortStringHashesResponse
        | { type: "error"; id: number; error: string }
      >,
    ) => {
      const { id } = e.data;
      const pending = this.pendingRequests.get(id);

      if (!pending) {
        return;
      }

      this.pendingRequests.delete(id);

      if (e.data.type === "sorted") {
        pending.resolve(e.data.data);
      } else if (e.data.type === "sortedIndices") {
        pending.resolve(e.data.indices);
      } else if (e.data.type === "sortedMultiColumn") {
        pending.resolve(e.data.indices);
      } else if (e.data.type === "sortedStringHashes") {
        pending.resolve({
          indices: e.data.indices,
          collisionPairs: e.data.collisionPairs,
        });
      } else if (e.data.type === "error") {
        pending.reject(new Error((e.data as { error: string }).error));
      }
    };

    // Handle worker errors
    this.worker.onerror = (e) => {
      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests) {
        pending.reject(new Error(`Worker error: ${e.message}`));
        this.pendingRequests.delete(id);
      }
    };
  }

  /**
   * Terminate the worker and clean up resources.
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    if (this.workerUrl) {
      URL.revokeObjectURL(this.workerUrl);
      this.workerUrl = null;
    }

    // Reject any pending requests
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error("Worker terminated"));
    }
    this.pendingRequests.clear();
    this.isTerminated = true;
  }

  /**
   * Check if the worker is currently available.
   */
  isAvailable(): boolean {
    return !this.isTerminated && typeof Worker !== "undefined";
  }
}

// =============================================================================
// Singleton Instance (optional usage pattern)
// =============================================================================

let sharedWorkerManager: SortWorkerManager | null = null;

/**
 * Get a shared SortWorkerManager instance.
 * Useful when multiple data sources should share the same worker.
 */
export function getSharedSortWorker(): SortWorkerManager {
  if (!sharedWorkerManager) {
    sharedWorkerManager = new SortWorkerManager();
  }
  return sharedWorkerManager;
}

/**
 * Terminate the shared worker and release resources.
 */
export function terminateSharedSortWorker(): void {
  if (sharedWorkerManager) {
    sharedWorkerManager.terminate();
    sharedWorkerManager = null;
  }
}
