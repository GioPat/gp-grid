// workerPool.ts - Manages Web Workers for parallel sorting
import type { SortDirection } from "../GridEngine";

interface SortConfig {
  field: string;
  direction: SortDirection;
}

interface WorkerTask {
  data: any[];
  sortConfigs: SortConfig[];
  resolve: (data: any[]) => void;
  reject: (error: Error) => void;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private taskQueue: WorkerTask[] = [];
  private workerCount: number;

  constructor(workerCount: number = navigator.hardwareConcurrency || 4) {
    this.workerCount = Math.min(workerCount, 8); // Cap at 8 workers
  }

  private createWorker(): Worker {
    // Create worker from blob to avoid separate file issues
    const workerCode = `
      function getFieldValue(obj, field) {
        const parts = field.split(".");
        let value = obj;
        for (const part of parts) {
          if (value == null) return null;
          value = value[part];
        }
        return value ?? null;
      }

      function compareValues(aVal, bVal, direction) {
        const aNum = aVal == null ? null : Number(aVal);
        const bNum = bVal == null ? null : Number(bVal);

        let comparison = 0;
        if (aVal == null && bVal == null) comparison = 0;
        else if (aVal == null) comparison = 1;
        else if (bVal == null) comparison = -1;
        else if (!isNaN(aNum) && !isNaN(bNum)) {
          comparison = aNum - bNum;
        } else {
          comparison = String(aVal).localeCompare(String(bVal));
        }

        return direction === "asc" ? comparison : -comparison;
      }

      function sortData(data, sortConfigs) {
        return data.sort((a, b) => {
          for (const config of sortConfigs) {
            const aVal = getFieldValue(a, config.field);
            const bVal = getFieldValue(b, config.field);
            const result = compareValues(aVal, bVal, config.direction);
            if (result !== 0) return result;
          }
          return 0;
        });
      }

      self.onmessage = (event) => {
        const { type, data, sortConfigs } = event.data;
        if (type === "sort") {
          const sorted = sortData(data, sortConfigs);
          self.postMessage({ type: "sorted", data: sorted });
        }
      };
    `;

    const blob = new Blob([workerCode], { type: "application/javascript" });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);

    worker.onerror = (error) => {
      console.error("Worker error:", error);
    };

    return worker;
  }

  private initializeWorkers(): void {
    if (this.workers.length > 0) return;

    for (let i = 0; i < this.workerCount; i++) {
      const worker = this.createWorker();
      this.workers.push(worker);
      this.availableWorkers.push(worker);
    }
  }

  private processQueue(): void {
    if (this.taskQueue.length === 0 || this.availableWorkers.length === 0) {
      return;
    }

    const worker = this.availableWorkers.shift()!;
    const task = this.taskQueue.shift()!;

    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === "sorted") {
        worker.removeEventListener("message", handleMessage);
        this.availableWorkers.push(worker);
        task.resolve(event.data.data);
        this.processQueue(); // Process next task
      }
    };

    worker.addEventListener("message", handleMessage);
    worker.postMessage({
      type: "sort",
      data: task.data,
      sortConfigs: task.sortConfigs,
    });
  }

  async sortChunk(data: any[], sortConfigs: SortConfig[]): Promise<any[]> {
    this.initializeWorkers();

    return new Promise((resolve, reject) => {
      this.taskQueue.push({ data, sortConfigs, resolve, reject });
      this.processQueue();
    });
  }

  async parallelSort(data: any[], sortConfigs: SortConfig[]): Promise<any[]> {
    this.initializeWorkers();

    const chunkSize = Math.ceil(data.length / this.workerCount);
    const chunks: any[][] = [];

    // Divide data into chunks
    for (let i = 0; i < data.length; i += chunkSize) {
      chunks.push(data.slice(i, i + chunkSize));
    }

    // Sort chunks in parallel
    const sortedChunks = await Promise.all(
      chunks.map((chunk) => this.sortChunk(chunk, sortConfigs)),
    );
    // Merge sorted chunks
    const result = this.mergeSortedChunks(sortedChunks, sortConfigs);

    return result;
  }

  private mergeSortedChunks(chunks: any[][], sortConfigs: SortConfig[]): any[] {
    if (chunks.length === 1) return chunks[0]!;
    if (chunks.length === 2) {
      // Optimized two-way merge
      return this.mergeTwoArrays(chunks[0]!, chunks[1]!, sortConfigs);
    }

    // K-way merge using min-heap for O(n log k) complexity
    const result: any[] = [];
    const heap: Array<{ value: any; chunkIndex: number; itemIndex: number }> =
      [];

    // Initialize heap with first element from each chunk
    for (let i = 0; i < chunks.length; i++) {
      if (chunks[i]!.length > 0) {
        heap.push({ value: chunks[i]![0], chunkIndex: i, itemIndex: 0 });
      }
    }

    // Build initial min-heap
    for (let i = Math.floor(heap.length / 2) - 1; i >= 0; i--) {
      this.heapifyDown(heap, i, sortConfigs);
    }

    // Extract min and add next element from same chunk
    while (heap.length > 0) {
      // Extract minimum (root)
      const min = heap[0]!;
      result.push(min.value);

      // Get next element from the same chunk
      const nextIndex = min.itemIndex + 1;
      if (nextIndex < chunks[min.chunkIndex]!.length) {
        heap[0] = {
          value: chunks[min.chunkIndex]![nextIndex],
          chunkIndex: min.chunkIndex,
          itemIndex: nextIndex,
        };
        this.heapifyDown(heap, 0, sortConfigs);
      } else {
        // Chunk exhausted, remove from heap
        heap[0] = heap[heap.length - 1]!;
        heap.pop();
        if (heap.length > 0) {
          this.heapifyDown(heap, 0, sortConfigs);
        }
      }
    }

    return result;
  }

  private mergeTwoArrays(a: any[], b: any[], sortConfigs: SortConfig[]): any[] {
    const result: any[] = [];
    let i = 0,
      j = 0;

    while (i < a.length && j < b.length) {
      if (this.compare(a[i], b[j], sortConfigs) <= 0) {
        result.push(a[i++]);
      } else {
        result.push(b[j++]);
      }
    }

    while (i < a.length) result.push(a[i++]);
    while (j < b.length) result.push(b[j++]);

    return result;
  }

  private heapifyDown(
    heap: Array<{ value: any; chunkIndex: number; itemIndex: number }>,
    index: number,
    sortConfigs: SortConfig[],
  ): void {
    const length = heap.length;
    let smallest = index;
    const left = 2 * index + 1;
    const right = 2 * index + 2;

    if (
      left < length &&
      this.compare(heap[left]!.value, heap[smallest]!.value, sortConfigs) < 0
    ) {
      smallest = left;
    }

    if (
      right < length &&
      this.compare(heap[right]!.value, heap[smallest]!.value, sortConfigs) < 0
    ) {
      smallest = right;
    }

    if (smallest !== index) {
      [heap[index], heap[smallest]] = [heap[smallest]!, heap[index]!];
      this.heapifyDown(heap, smallest, sortConfigs);
    }
  }

  private compare(a: any, b: any, sortConfigs: SortConfig[]): number {
    for (const config of sortConfigs) {
      const aVal = this.getFieldValue(a, config.field);
      const bVal = this.getFieldValue(b, config.field);
      const result = this.compareValues(aVal, bVal, config.direction);
      if (result !== 0) return result;
    }
    return 0;
  }

  private getFieldValue(obj: any, field: string): any {
    const parts = field.split(".");
    let value = obj;
    for (const part of parts) {
      if (value == null) return null;
      value = value[part];
    }
    return value ?? null;
  }

  private compareValues(
    aVal: any,
    bVal: any,
    direction: SortDirection,
  ): number {
    const aNum = aVal == null ? null : Number(aVal);
    const bNum = bVal == null ? null : Number(bVal);

    let comparison = 0;
    if (aVal == null && bVal == null) comparison = 0;
    else if (aVal == null) comparison = 1;
    else if (bVal == null) comparison = -1;
    else if (!isNaN(aNum!) && !isNaN(bNum!)) {
      comparison = aNum! - bNum!;
    } else {
      comparison = String(aVal).localeCompare(String(bVal));
    }

    return direction === "asc" ? comparison : -comparison;
  }

  terminate(): void {
    this.workers.forEach((worker) => worker.terminate());
    this.workers = [];
    this.availableWorkers = [];
    this.taskQueue = [];
  }
}

// Singleton instance
let workerPool: WorkerPool | null = null;

export function getWorkerPool(): WorkerPool {
  if (!workerPool) {
    workerPool = new WorkerPool();
  }
  return workerPool;
}

export function terminateWorkerPool(): void {
  if (workerPool) {
    workerPool.terminate();
    workerPool = null;
  }
}
