import { ReactElement } from "react";
import { createPortal } from "react-dom";

export default class PortalManager {
  private portals: Map<
    string,
    { container: HTMLElement; content: ReactElement }
  > = new Map();
  private updateCallback: ((portals: ReactElement[]) => void) | null = null;

  setUpdateCallback(callback: (portals: ReactElement[]) => void) {
    this.updateCallback = callback;
  }

  createPortal(
    key: string,
    container: HTMLElement,
    content: ReactElement,
  ): void {
    this.portals.set(key, { container, content });
    this.notifyUpdate();
  }

  removePortal(key: string): void {
    this.portals.delete(key);
    this.notifyUpdate();
  }

  /**
   * Synchronously removes a portal from the Map and triggers React update immediately.
   * Use this when you need to ensure the portal is removed before removing the container DOM node.
   * Returns true if portal existed and was removed, false otherwise.
   */
  removePortalSync(key: string): boolean {
    const existed = this.portals.has(key);
    this.portals.delete(key);
    // Trigger update synchronously to ensure React processes portal removal
    // before the container DOM node is removed
    if (this.updateCallback) {
      this.updateCallback(this.getPortals());
    }
    return existed;
  }

  /**
   * Check if a portal exists for the given key.
   */
  hasPortal(key: string): boolean {
    return this.portals.has(key);
  }

  /**
   * Get portal info for the given key (for debugging/comparison).
   */
  getPortal(key: string): { container: HTMLElement; content: ReactElement } | undefined {
    return this.portals.get(key);
  }

  clearAll(): void {
    this.portals.clear();
    this.notifyUpdate();
  }

  private notifyUpdate(): void {
    if (this.updateCallback !== null) {
      this.updateCallback(this.getPortals());
    }
   }

  getPortals(): ReactElement[] {
    return Array.from(this.portals.entries()).map(
      ([key, { container, content }]) => createPortal(content, container, key),
    );
  }
}
