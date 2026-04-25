import {
  AutoScrollDriver,
  DataSourceOwner,
  GridCore,
  InputEventAdapter,
  PendingRowDragController,
  applyBatchInstructions,
  scrollCellIntoView,
} from '@gp-grid/core';
import type {
  ColumnDefinition,
  DataSource,
  HighlightingOptions,
} from '@gp-grid/core';
import type { GpGridViewModel } from './gp-grid-view-model';

export interface GpGridBindingsDeps {
  vm: GpGridViewModel;
  isBrowser: boolean;
  getContainer: () => HTMLElement | null;
  getBody: () => HTMLElement | null;
  getRowHeight: () => number;
  getHeaderHeight: () => number;
}

/**
 * Owns the core grid instance plus every framework-agnostic adapter the
 * Angular component drives (auto-scroll, pending row-drag, input events,
 * data source ownership). The component becomes a thin shell that holds
 * lifecycle + Angular template bindings and delegates state work here.
 */
export class GpGridBindings<TData = unknown> {
  readonly dataSourceOwner = new DataSourceOwner<TData>();
  readonly autoScroll: AutoScrollDriver;
  readonly pendingRowDrag: PendingRowDragController;
  readonly input: InputEventAdapter<TData>;

  coreRef: GridCore<TData> | null = null;
  private unsubscribe: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(private readonly deps: GpGridBindingsDeps) {
    this.autoScroll = new AutoScrollDriver(
      () => this.deps.getBody(),
      (event) => this.input.dragMove(event),
    );
    this.pendingRowDrag = new PendingRowDragController({
      getCore: () => this.coreRef,
      getContainer: this.deps.getContainer,
      isBrowser: this.deps.isBrowser,
      onDragConfirmed: (state) => this.deps.vm.dragState.set(state),
    });
    this.input = new InputEventAdapter<TData>({
      getCore: () => this.coreRef,
      getBodyEl: this.deps.getBody,
      autoScroll: this.autoScroll,
      pendingRowDrag: this.pendingRowDrag,
      onDragStateChange: (state) => this.deps.vm.dragState.set(state),
    });
  }

  attach(core: GridCore<TData>): void {
    this.coreRef = core;
    this.unsubscribe = core.onBatchInstruction((instructions) => {
      const vm = this.deps.vm;
      const maps = applyBatchInstructions(
        instructions,
        vm.slots(),
        vm.headerState(),
        vm.batchSetters,
      );
      vm.slots.set(new Map(maps.slots));
      vm.headerState.set(new Map(maps.headers));
    });

    core.initialize();
    core.input.updateDeps({
      getHeaderHeight: this.deps.getHeaderHeight,
      getRowHeight: this.deps.getRowHeight,
      getColumnPositions: () => this.deps.vm.columnPositions(),
      getColumnLayout: () => this.deps.vm.columnLayout(),
      getColumnCount: () => this.deps.vm.visibleColumnWithIndices().length,
      getOriginalColumnIndex: (visibleIndex) =>
        this.deps.vm.visibleColumnWithIndices()[visibleIndex]?.originalIndex ?? visibleIndex,
    });
  }

  observeViewport(container: HTMLElement, bodyEl: HTMLElement): void {
    this.deps.vm.viewportWidth.set(container.clientWidth);
    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) this.deps.vm.viewportWidth.set(entry.contentRect.width);
    });
    this.resizeObserver.observe(container);
    this.coreRef?.setViewport(0, 0, container.clientWidth, bodyEl.clientHeight);
  }

  destroy(): void {
    this.autoScroll.stop();
    this.pendingRowDrag.cancel();
    this.pendingRowDrag.releaseLocks();
    this.unsubscribe?.();
    this.resizeObserver?.disconnect();
    this.coreRef?.destroy();
    this.dataSourceOwner.destroy();
    this.coreRef = null;
  }

  syncHighlighting(opts: HighlightingOptions | null): void {
    const core = this.coreRef;
    if (core?.highlight && opts) {
      core.highlight.updateOptions(opts as HighlightingOptions<TData>);
    }
  }

  syncColumns(cols: ColumnDefinition[]): void {
    const core = this.coreRef;
    if (core === null) return;
    if (this.dataSourceOwner.syncColumns(cols)) core.setColumns(cols);
  }

  syncRows(rows: TData[], dataSource: DataSource<TData> | null): void {
    const core = this.coreRef;
    if (core === null) return;
    const newDs = this.dataSourceOwner.syncRows(rows, dataSource);
    if (newDs !== null) core.setDataSource(newDs);
  }

  applyPendingScroll(): void {
    const top = this.deps.vm.pendingScrollTop();
    const body = this.deps.getBody();
    if (top !== null && body) {
      body.scrollTop = top;
      this.deps.vm.pendingScrollTop.set(null);
    }
  }

  scrollToRow(row: number): void {
    const core = this.coreRef;
    const body = this.deps.getBody();
    if (core === null || body === null) return;
    scrollCellIntoView(
      core,
      body,
      row,
      this.deps.getRowHeight(),
      this.deps.vm.slots(),
      this.deps.vm.rowsWrapperOffset(),
    );
  }
}
