import {
  AutoScrollDriver,
  DataSourceOwner,
  GridCore,
  InputEventAdapter,
  PendingCellTapController,
  PendingRowDragController,
  TouchScrollController,
  applyBatchInstructions,
  readIsRtl,
  scrollCellIntoView,
  toInlineX,
  toPhysicalX,
} from '@gp-grid/core';
import type {
  ColumnDefinition,
  ColumnLayoutMode,
  ColumnStateUpdate,
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
  readonly pendingRowDrag: PendingRowDragController<TData>;
  readonly pendingCellTap: PendingCellTapController<TData>;
  readonly touchScroll: TouchScrollController<TData>;
  readonly input: InputEventAdapter<TData>;

  coreRef: GridCore<TData> | null = null;
  private unsubscribe: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private rtl = false;

  /** Inline direction sampled from the body element; a `dir` flip needs a remount. */
  get isRtl(): boolean {
    return this.rtl;
  }

  constructor(private readonly deps: GpGridBindingsDeps) {
    this.autoScroll = new AutoScrollDriver(
      () => this.deps.getBody(),
      (event) => this.input.dragMove(event),
    );
    this.pendingRowDrag = new PendingRowDragController<TData>({
      getCore: () => this.coreRef,
      getContainer: this.deps.getContainer,
      isBrowser: this.deps.isBrowser,
      onDragConfirmed: (state) => this.deps.vm.dragState.set(state),
    });
    this.pendingCellTap = new PendingCellTapController<TData>({
      getCore: () => this.coreRef,
      isBrowser: this.deps.isBrowser,
      onTapConfirmed: () => this.deps.getContainer()?.focus(),
    });
    this.touchScroll = new TouchScrollController<TData>({
      getCore: () => this.coreRef,
      getScrollEl: this.deps.getBody,
      isBrowser: this.deps.isBrowser,
    });
    this.input = new InputEventAdapter<TData>({
      getCore: () => this.coreRef,
      getBodyEl: this.deps.getBody,
      autoScroll: this.autoScroll,
      pendingRowDrag: this.pendingRowDrag,
      pendingCellTap: this.pendingCellTap,
      onDragStateChange: (state) => this.deps.vm.dragState.set(state),
    });
  }

  attach(core: GridCore<TData>): void {
    this.coreRef = core;
    this.touchScroll.syncCore();
    this.deps.vm.columns.set(core.getColumns());
    this.unsubscribe = core.onBatchInstruction((instructions) => {
      const vm = this.deps.vm;
      // The applier is copy-on-write: a map the batch did not touch comes back
      // by reference, so the signal's own equality check suppresses the
      // notification without the binding comparing anything.
      const maps = applyBatchInstructions(
        instructions,
        vm.slots(),
        vm.headerState(),
        vm.batchSetters,
      );
      vm.slots.set(maps.slots);
      vm.headerState.set(maps.headers);
    });

    core.initialize();
  }

  /**
   * Report the body scroll container's measurements. The body element — not
   * the outer container — owns the client area and the scrollbars, so its
   * `clientWidth` is the viewport width the layout resolves against.
   */
  observeViewport(bodyEl: HTMLElement): void {
    const report = (): void => {
      this.rtl = readIsRtl(bodyEl);
      this.touchScroll.resetDirection();
      this.coreRef?.setViewport(
        bodyEl.scrollTop,
        toInlineX(bodyEl.scrollLeft, this.rtl),
        bodyEl.clientWidth,
        bodyEl.clientHeight,
      );
    };
    report();
    this.resizeObserver = new ResizeObserver(() => report());
    this.resizeObserver.observe(bodyEl);
    // Synthetic touch scrolling: takes over touch gestures only when scroll
    // virtualization compresses the DOM scroll space; inert otherwise.
    this.touchScroll.attach();
  }

  destroy(): void {
    this.autoScroll.stop();
    this.pendingRowDrag.cancel();
    this.pendingRowDrag.releaseLocks();
    this.pendingCellTap.cancel();
    this.touchScroll.detach();
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

  /** Apply a controlled column-state input; explicit commands win. */
  syncColumnState(updates: ColumnStateUpdate[]): void {
    this.coreRef?.setColumnState(updates);
  }

  syncRows(rows: TData[], dataSource: DataSource<TData> | null): void {
    const core = this.coreRef;
    if (core === null) return;
    const newDs = this.dataSourceOwner.syncRows(rows, dataSource);
    if (newDs !== null) core.setDataSource(newDs);
  }

  applyPendingScroll(): void {
    const top = this.deps.vm.pendingScrollTop();
    const left = this.deps.vm.pendingScrollLeft();
    const body = this.deps.getBody();
    if (body === null) return;
    if (top === null && left === null) return;
    this.touchScroll.stop();
    if (top !== null) {
      body.scrollTop = top;
      this.deps.vm.pendingScrollTop.set(null);
    }
    if (left !== null) {
      body.scrollLeft = toPhysicalX(left, this.rtl);
      this.deps.vm.pendingScrollLeft.set(null);
    }
  }

  /** Switch the displayed-width policy without recreating the core. */
  syncColumnLayout(mode: ColumnLayoutMode): void {
    this.coreRef?.setColumnLayout(mode);
  }

  scrollToCell(cell: { row: number; col: number }): void {
    const core = this.coreRef;
    const body = this.deps.getBody();
    if (core === null || body === null) return;
    this.touchScroll.stop();
    scrollCellIntoView(core, body, cell.row, cell.col);
  }
}
