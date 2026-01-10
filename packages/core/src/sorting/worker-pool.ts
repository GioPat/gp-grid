// packages/core/src/sorting/worker-pool.ts
// Manages a pool of Web Workers for parallel operations

// =============================================================================
// Types
// =============================================================================

export interface WorkerPoolOptions {
  /** Maximum number of workers (default: navigator.hardwareConcurrency ?? 4) */
  maxWorkers?: number;
  /** Whether to pre-warm workers on initialization */
  preWarm?: boolean;
}

interface PendingTask<TResponse> {
  resolve: (value: TResponse) => void;
  reject: (error: Error) => void;
}

interface WorkerState {
  worker: Worker;
  busy: boolean;
  pendingRequests: Map<number, PendingTask<unknown>>;
}

// =============================================================================
// WorkerPool
// =============================================================================

/**
 * Manages a pool of Web Workers for parallel task execution.
 * Workers are created lazily and reused across operations.
 */
export class WorkerPool {
  private workerCode: string;
  private maxWorkers: number;
  private workers: WorkerState[] = [];
  private workerUrl: string | null = null;
  private nextRequestId = 0;
  private isTerminated = false;

  constructor(workerCode: string, options: WorkerPoolOptions = {}) {
    this.workerCode = workerCode;
    this.maxWorkers =
      options.maxWorkers ??
      (typeof navigator !== "undefined" ? navigator.hardwareConcurrency : 4) ??
      4;

    if (options.preWarm) {
      this.preWarmWorkers();
    }
  }

  /**
   * Get the current pool size (number of active workers).
   */
  getPoolSize(): number {
    return this.workers.length;
  }

  /**
   * Get the maximum pool size.
   */
  getMaxWorkers(): number {
    return this.maxWorkers;
  }

  /**
   * Check if the pool is available for use.
   */
  isAvailable(): boolean {
    return !this.isTerminated && typeof Worker !== "undefined";
  }

  /**
   * Execute a single task on an available worker.
   * Returns the worker's response.
   */
  async execute<TRequest extends { id?: number }, TResponse>(
    request: TRequest,
    transferables?: Transferable[],
  ): Promise<TResponse> {
    if (this.isTerminated) {
      throw new Error("WorkerPool has been terminated");
    }

    if (typeof Worker === "undefined") {
      throw new Error("Web Workers are not available in this environment");
    }

    const worker = this.getAvailableWorker();
    const id = this.nextRequestId++;
    const requestWithId = { ...request, id };

    return new Promise((resolve, reject) => {
      worker.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      worker.busy = true;

      if (transferables && transferables.length > 0) {
        worker.worker.postMessage(requestWithId, transferables);
      } else {
        worker.worker.postMessage(requestWithId);
      }
    });
  }

  /**
   * Execute multiple tasks in parallel across available workers.
   * Each task is assigned to a different worker if possible.
   * Returns results in the same order as the input requests.
   */
  async executeParallel<TRequest extends { id?: number }, TResponse>(
    tasks: Array<{ request: TRequest; transferables?: Transferable[] }>,
  ): Promise<TResponse[]> {
    if (this.isTerminated) {
      throw new Error("WorkerPool has been terminated");
    }

    if (tasks.length === 0) {
      return [];
    }

    // Ensure we have enough workers for parallel execution
    const numWorkers = Math.min(tasks.length, this.maxWorkers);
    this.ensureWorkers(numWorkers);

    // Create promises for all tasks
    const promises = tasks.map((task, index) => {
      const workerIndex = index % this.workers.length;
      const worker = this.workers[workerIndex]!;
      const id = this.nextRequestId++;
      const requestWithId = { ...task.request, id };

      return new Promise<TResponse>((resolve, reject) => {
        worker.pendingRequests.set(id, {
          resolve: resolve as (value: unknown) => void,
          reject,
        });
        worker.busy = true;

        if (task.transferables && task.transferables.length > 0) {
          worker.worker.postMessage(requestWithId, task.transferables);
        } else {
          worker.worker.postMessage(requestWithId);
        }
      });
    });

    return Promise.all(promises);
  }

  /**
   * Terminate all workers and clean up resources.
   */
  terminate(): void {
    for (const workerState of this.workers) {
      workerState.worker.terminate();

      // Reject any pending requests
      for (const [, pending] of workerState.pendingRequests) {
        pending.reject(new Error("Worker pool terminated"));
      }
      workerState.pendingRequests.clear();
    }
    this.workers = [];

    if (this.workerUrl) {
      URL.revokeObjectURL(this.workerUrl);
      this.workerUrl = null;
    }

    this.isTerminated = true;
  }

  /**
   * Pre-warm workers by creating them ahead of time.
   */
  private preWarmWorkers(): void {
    this.ensureWorkers(this.maxWorkers);
  }

  /**
   * Ensure at least `count` workers exist in the pool.
   */
  private ensureWorkers(count: number): void {
    const needed = Math.min(count, this.maxWorkers) - this.workers.length;
    for (let i = 0; i < needed; i++) {
      this.createWorker();
    }
  }

  /**
   * Get an available worker, creating one if needed.
   */
  private getAvailableWorker(): WorkerState {
    // First, try to find an idle worker
    const idleWorker = this.workers.find((w) => !w.busy);
    if (idleWorker) {
      return idleWorker;
    }

    // If we can create more workers, do so
    if (this.workers.length < this.maxWorkers) {
      return this.createWorker();
    }

    // Otherwise, use round-robin on existing workers
    // (they can queue multiple requests)
    const leastBusy = this.workers.reduce((min, w) =>
      w.pendingRequests.size < min.pendingRequests.size ? w : min,
    );
    return leastBusy;
  }

  /**
   * Create a new worker and add it to the pool.
   */
  private createWorker(): WorkerState {
    // Create blob URL once and reuse
    if (!this.workerUrl) {
      const blob = new Blob([this.workerCode], {
        type: "application/javascript",
      });
      this.workerUrl = URL.createObjectURL(blob);
    }

    const worker = new Worker(this.workerUrl);
    const workerState: WorkerState = {
      worker,
      busy: false,
      pendingRequests: new Map(),
    };

    worker.onmessage = (e: MessageEvent) => {
      const { id } = e.data;
      const pending = workerState.pendingRequests.get(id);

      if (pending) {
        workerState.pendingRequests.delete(id);

        if (workerState.pendingRequests.size === 0) {
          workerState.busy = false;
        }

        if (e.data.type === "error") {
          pending.reject(new Error(e.data.error));
        } else {
          pending.resolve(e.data);
        }
      }
    };

    worker.onerror = (error) => {
      // Reject all pending requests for this worker
      for (const [, pending] of workerState.pendingRequests) {
        pending.reject(new Error(`Worker error: ${error.message}`));
      }
      workerState.pendingRequests.clear();
      workerState.busy = false;

      // Try to respawn the worker
      this.respawnWorker(workerState);
    };

    this.workers.push(workerState);
    return workerState;
  }

  /**
   * Respawn a failed worker.
   */
  private respawnWorker(failedWorker: WorkerState): void {
    const index = this.workers.indexOf(failedWorker);
    if (index === -1) return;

    try {
      failedWorker.worker.terminate();
    } catch {
      // Ignore termination errors
    }

    // Remove the failed worker
    this.workers.splice(index, 1);

    // Create a new one if we're under capacity
    if (this.workers.length < this.maxWorkers && !this.isTerminated) {
      this.createWorker();
    }
  }
}
