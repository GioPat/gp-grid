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
  ColumnGroupChild,
  ColumnLayoutMode,
  ColumnStateUpdate,
  DataSource,
  FreezeRowsOptions,
  HighlightingOptions,
  RowGrouping,
} from '@gp-grid/core';
import type { GpGridViewModel } from './gp-grid-view-model';
import { hierarchicalOf } from './gp-grid-row-groups';

const isSubscribable = (
  dataSource: object | null | undefined,
): dataSource is { subscribe: (listener: () => void) => () => void } =>
  typeof (dataSource as { subscribe?: unknown } | null | undefined)?.subscribe === 'function';

export interface GpGridBindingsDeps {
  vm: GpGridViewModel;
  isBrowser: boolean;
  getContainer: () => HTMLElement | null;
  getBody: () => HTMLElement | null;
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
  private unsubscribeSource: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private rtl = false;
  private appliedGroups: readonly ColumnGroupChild[] | undefined = undefined;
  private appliedGrouping: RowGrouping | null | undefined = undefined;

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

  attach(core: GridCore<TData>, dataSource: DataSource<TData>): void {
    this.coreRef = core;
    this.watchSource(dataSource);
    this.touchScroll.syncCore();
    this.deps.vm.columns.set(core.columns.get());
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
      const hierarchical = hierarchicalOf(instructions);
      if (hierarchical !== null) vm.hierarchical.set(hierarchical);
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
      this.deps.vm.rtl.set(this.rtl);
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
    this.unsubscribeSource?.();
    this.unsubscribeSource = null;
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

  /** Columns and groups go in one call, so the hierarchy is validated against the new ids. */
  syncColumns(cols: ColumnDefinition[], groups: readonly ColumnGroupChild[] | undefined): void {
    const core = this.coreRef;
    if (core === null) return;
    const columnsChanged = this.dataSourceOwner.syncColumns(cols);
    const groupsChanged = this.appliedGroups !== groups;
    this.appliedGroups = groups;
    if (columnsChanged || groupsChanged) core.columns.set(cols, groups ?? null);
  }

  syncHeaderBandHeights(heights: readonly number[] | undefined): void {
    this.coreRef?.header.setBandHeights(heights ?? []);
  }

  /** Apply a controlled column-state input; explicit commands win. */
  syncColumnState(updates: ColumnStateUpdate[]): void {
    this.coreRef?.columns.setState(updates);
  }

  syncRows(rows: TData[], dataSource: DataSource<TData> | null): void {
    const core = this.coreRef;
    if (core === null) return;
    const newDs = this.dataSourceOwner.syncRows(rows, dataSource);
    if (newDs === null) return;
    this.watchSource(newDs);
    core.setDataSource(newDs);
  }

  /** A `MutableDataSource` announces its transactions; refresh the visible window on each. */
  private watchSource(dataSource: DataSource<TData>): void {
    this.unsubscribeSource?.();
    this.unsubscribeSource = isSubscribable(dataSource)
      ? dataSource.subscribe(() => void this.coreRef?.refreshFromTransaction())
      : null;
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
    this.coreRef?.columns.setLayout(mode);
  }

  /** Apply a runtime freeze configuration without recreating the core. */
  syncFreezeRows(config: FreezeRowsOptions | undefined): void {
    this.coreRef?.frozenRows.set(config);
  }

  /**
   * Before the core exists this records the grouping it is created with; a
   * later value reaches that core through `setGrouping`, never a new core.
   */
  syncRowGrouping(grouping: RowGrouping | null | undefined): void {
    if (this.appliedGrouping === grouping) return;
    this.appliedGrouping = grouping;
    this.coreRef?.rowGroups.setGrouping(grouping ?? null);
  }

  syncRowResize(enabled: boolean): void {
    this.coreRef?.rowHeights.setResizable(enabled);
  }

  scrollToCell(cell: { row: number; col: number }): void {
    const core = this.coreRef;
    const body = this.deps.getBody();
    if (core === null || body === null) return;
    this.touchScroll.stop();
    scrollCellIntoView(core, body, cell.row, cell.col);
  }
}
