// gp-grid-core/src/worker-manager.ts
// Manages Web Worker lifecycle for sorting operations

import type { SortModel, SortDirection } from "./types";
import { SORT_WORKER_CODE } from "./sort-worker";
import type { SortWorkerRequest, SortWorkerResponse, SortIndicesRequest, SortIndicesResponse } from "./sort-worker";

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
  async sortIndices(values: number[], direction: SortDirection): Promise<Uint32Array> {
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
   * Initialize the worker using an inline Blob URL.
   * This works without bundler-specific configuration.
   */
  private initializeWorker(): void {
    // Check if Web Workers are available
    if (typeof Worker === "undefined") {
      throw new Error("Web Workers are not available in this environment");
    }

    // Create Blob URL from inline worker code
    const blob = new Blob([SORT_WORKER_CODE], { type: "application/javascript" });
    this.workerUrl = URL.createObjectURL(blob);
    this.worker = new Worker(this.workerUrl);

    // Handle messages from worker
    this.worker.onmessage = (e: MessageEvent<SortWorkerResponse | SortIndicesResponse | { type: "error"; id: number; error: string }>) => {
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
