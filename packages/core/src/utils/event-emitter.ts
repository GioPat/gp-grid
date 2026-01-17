// packages/core/src/utils/event-emitter.ts

import type { GridInstruction, InstructionListener } from "../types";

/**
 * Batch instruction listener for efficient state updates
 */
export type BatchInstructionListener = (instructions: GridInstruction[]) => void;

/**
 * Event emitter interface for instruction-based communication
 */
export interface InstructionEmitter {
  onInstruction: (listener: InstructionListener) => () => void;
  emit: (instruction: GridInstruction) => void;
  clearListeners: () => void;
}

/**
 * Extended event emitter with batch support
 */
export interface BatchInstructionEmitter extends InstructionEmitter {
  onBatchInstruction: (listener: BatchInstructionListener) => () => void;
  emitBatch: (instructions: GridInstruction[]) => void;
}

/**
 * Create a simple instruction emitter for managers
 * Eliminates boilerplate listener management code
 */
export const createInstructionEmitter = (): InstructionEmitter => {
  let listeners: InstructionListener[] = [];

  const onInstruction = (listener: InstructionListener): (() => void) => {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  };

  const emit = (instruction: GridInstruction): void => {
    for (const listener of listeners) {
      listener(instruction);
    }
  };

  const clearListeners = (): void => {
    listeners = [];
  };

  return { onInstruction, emit, clearListeners };
};

/**
 * Create an instruction emitter with batch support
 * Used by GridCore and SlotPoolManager for efficient updates
 */
export const createBatchInstructionEmitter = (): BatchInstructionEmitter => {
  let listeners: InstructionListener[] = [];
  let batchListeners: BatchInstructionListener[] = [];

  const onInstruction = (listener: InstructionListener): (() => void) => {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  };

  const onBatchInstruction = (listener: BatchInstructionListener): (() => void) => {
    batchListeners.push(listener);
    return () => {
      batchListeners = batchListeners.filter((l) => l !== listener);
    };
  };

  const emit = (instruction: GridInstruction): void => {
    // Emit to individual listeners
    for (const listener of listeners) {
      listener(instruction);
    }
    // Also emit as a single-item batch
    for (const listener of batchListeners) {
      listener([instruction]);
    }
  };

  const emitBatch = (instructions: GridInstruction[]): void => {
    if (instructions.length === 0) return;
    // Emit to batch listeners as a single batch
    for (const listener of batchListeners) {
      listener(instructions);
    }
    // Also emit to individual listeners for backwards compatibility
    for (const instruction of instructions) {
      for (const listener of listeners) {
        listener(instruction);
      }
    }
  };

  const clearListeners = (): void => {
    listeners = [];
    batchListeners = [];
  };

  return { onInstruction, onBatchInstruction, emit, emitBatch, clearListeners };
};
