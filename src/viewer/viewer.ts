import { applyHighlight, autoZoom } from "./highlight.js";
import { goStep, toggleFocus, resetOverview, bindKeyboard, renderBody } from "./navigation.js";
import { tagNodes, tagEdges, setupEdgeTooltips } from "./tagging.js";
import type { Step, ViewerOptions, ViewerSelectors, SvgPanZoom } from "./types.js";

const DEFAULT_SELECTORS: Required<ViewerSelectors> = {
  canvasWrap: "#canvas-wrap",
  svgHost: "#svg-host",
  targetSvg: "#svg-host > svg",
  stepButtons: ".step-btn",
  stepTag: "#step-tag",
  stepTitle: "#step-title",
  stepBody: "#step-body",
  prevBtn: "#btn-prev",
  nextBtn: "#btn-next",
  focusBtn: "#btn-focus",
  fitBtn: "#btn-fit",
  panelToggleBtn: "#btn-panel-toggle",
  zoomInBtn: "#btn-zoom-in",
  zoomOutBtn: "#btn-zoom-out",
  detailDrawer: "#detail-drawer",
  drawerNodeId: "#drawer-node-id",
  drawerBody: "#drawer-body",
  edgeTooltip: "#edge-tooltip",
};

export class DiaScopeViewer {
  curStep = 0;
  focusMode = false;
  zoomRaf: number | null = null;
  pz: SvgPanZoom | null = null;
  canvasWrap: HTMLElement | null = null;
  svgHost: HTMLElement | null = null;
  stepTagEl: HTMLElement | null = null;
  stepTitleEl: HTMLElement | null = null;
  stepBodyEl: HTMLElement | null = null;
  prevBtn: (HTMLButtonElement & { disabled: boolean }) | null = null;
  nextBtn: (HTMLButtonElement & { disabled: boolean }) | null = null;
  focusBtn: HTMLButtonElement | null = null;
  fitBtn: HTMLButtonElement | null = null;
  panelToggleBtn: HTMLButtonElement | null = null;
  zoomInBtn: HTMLButtonElement | null = null;
  zoomOutBtn: HTMLButtonElement | null = null;
  detailDrawerEl: HTMLElement | null = null;
  drawerNodeIdEl: HTMLElement | null = null;
  drawerBodyEl: HTMLElement | null = null;
  edgeTooltipEl: HTMLElement | null = null;
  onResize: (() => void) | null = null;
  onMouseMove: ((e: MouseEvent) => void) | null = null;
  onCanvasClick: ((e: MouseEvent) => void) | null = null;
  onKeyDown: ((e: KeyboardEvent) => void) | null = null;

  readonly doc: Document;
  readonly steps: Step[];
  readonly nodeIds: string[];
  readonly detailPanels: Record<string, string>;
  readonly edgeTooltips: Record<string, string>;
  readonly selectors: Required<ViewerSelectors>;
  readonly contextNodeOpacity: string;
  readonly contextEdgeOpacity: string;
  readonly zoomFill: number;
  readonly zoomFrames: number;
  readonly panZoomMin: number;
  readonly panZoomMax: number;
  readonly panZoomOptions: Record<string, unknown>;
  readonly exposeGlobals: boolean;
  readonly autoBindControls: boolean;
  readonly expandable: boolean;
  readonly minInitialZoom: number | undefined;
  readonly narrowBreakpoint: number;
  readonly overview: ViewerOptions['overview'];
  private narrowObserver: ResizeObserver | null = null;
  private canvasObserver: ResizeObserver | null = null;
  private viewportSyncRaf: number | null = null;
  private lastKnownViewport: { zoom: number; pan: { x: number; y: number } } | null = null;
  private readonly svgPanZoomImpl: ((svg: SVGElement, opts: Record<string, unknown>) => SvgPanZoom) | undefined;

  constructor(options: ViewerOptions) {
    this.doc = options.document ?? document;
    this.steps = options.steps ?? [];
    this.nodeIds = options.nodeIds ?? [];
    this.detailPanels = options.detailPanels ?? {};
    this.edgeTooltips = options.edgeTooltips ?? {};
    this.selectors = { ...DEFAULT_SELECTORS, ...(options.selectors ?? {}) };
    this.contextNodeOpacity = options.contextNodeOpacity ?? "0.22";
    this.contextEdgeOpacity = options.contextEdgeOpacity ?? "0.18";
    this.zoomFill = options.zoomFill ?? 0.65;
    this.zoomFrames = options.zoomFrames ?? 22;
    this.panZoomMin = options.panZoomMin ?? 0.05;
    this.panZoomMax = options.panZoomMax ?? 15;
    this.panZoomOptions = options.panZoomOptions ?? {};
    this.exposeGlobals = options.exposeGlobals ?? true;
    this.autoBindControls = options.autoBindControls ?? false;
    this.expandable = options.expandable ?? false;
    this.minInitialZoom = options.minInitialZoom;
    this.narrowBreakpoint = options.narrowBreakpoint ?? 640;
    this.overview = options.overview;
    this.svgPanZoomImpl = options.svgPanZoom ?? (typeof window !== "undefined" ? (window as Window & { svgPanZoom?: (svg: SVGElement, opts: Record<string, unknown>) => SvgPanZoom }).svgPanZoom : undefined);
  }

  getDiagramSvg(): SVGElement | null {
    return this.doc.querySelector(this.selectors.targetSvg);
  }

  showDetail(nodeId: string): void {
    const content = this.detailPanels[nodeId];
    if (!content || !this.detailDrawerEl) return;
    if (this.drawerNodeIdEl) this.drawerNodeIdEl.textContent = nodeId;
    if (this.drawerBodyEl) this.drawerBodyEl.innerHTML = content;
    this.detailDrawerEl.classList.add("open");
  }

  hideDetail(): void {
    this.detailDrawerEl?.classList.remove("open");
  }

  hideEdgeTooltip(): void {
    this.edgeTooltipEl?.classList.remove("visible");
  }

  hideTransientUI(): void {
    this.hideDetail();
    this.hideEdgeTooltip();
  }

  /** After pz.fit(), if the resulting zoom is below minInitialZoom, zoom up to it. */
  private applyMinInitialZoom(): void {
    if (this.minInitialZoom === undefined || !this.pz) return;
    if (this.pz.getZoom() < this.minInitialZoom) {
      this.pz.zoom(this.minInitialZoom);
      this.pz.center();
    }
  }

  /**
   * Activate the "All" overview: clears all highlights, fits the diagram, and updates the panel.
   * Called when the user clicks the "All" pill or navigates past a step boundary.
   * Only meaningful when `overview` is configured.
   */
  showOverview(btn: Element | null = null): void {
    this.curStep = -1;
    const win = this.doc.defaultView;
    if (win) (win as Window & { curStep?: number }).curStep = -1;

    // Mark the "All" pill active, clear all other step buttons
    this.doc.querySelectorAll(this.selectors.stepButtons).forEach((b) => b.classList.remove("active"));
    const allBtn = btn ?? this.doc.querySelector(`${this.selectors.stepButtons}[data-step="all"]`);
    if (allBtn) allBtn.classList.add("active");

    const hasContent = !!(this.overview?.title || this.overview?.body);
    if (this.stepTagEl) this.stepTagEl.textContent = "";
    if (this.stepTitleEl) this.stepTitleEl.textContent = this.overview?.title ?? "";
    if (this.stepBodyEl) this.stepBodyEl.innerHTML = renderBody(this.overview?.body ?? "");

    // overview-mode hides step-content and toolbar, leaving only the step nav visible
    this.getStoryShell()?.classList.toggle("overview-mode", !hasContent);

    this.hideTransientUI();
    applyHighlight(this, []);
    this.pz?.fit();
    this.pz?.center();
    this.applyMinInitialZoom();

    // Disable Prev when overview is first (leftmost); Prev enabled when position=last
    const overviewAtFirst = this.overview?.position !== 'last';
    if (this.prevBtn) this.prevBtn.disabled = overviewAtFirst;
    if (this.nextBtn) this.nextBtn.disabled = !overviewAtFirst;
  }

  goStep(idx: number, btn: Element | null = null): void {
    goStep(this, idx, btn);
  }

  toggleFocus(): void {
    toggleFocus(this);
  }

  resetOverview(): void {
    resetOverview(this);
  }

  zoomIn(): void {
    this.pz?.zoomIn();
  }

  zoomOut(): void {
    this.pz?.zoomOut();
  }

  getStoryShell(): HTMLElement | null {
    return this.doc.querySelector("#story-shell");
  }

  private captureViewportState(): { zoom: number; pan: { x: number; y: number } } | null {
    if (!this.pz) return null;
    const zoom = this.pz.getZoom();
    const pan = this.pz.getPan();
    if (!Number.isFinite(zoom) || zoom <= 0) return null;
    if (!Number.isFinite(pan.x) || !Number.isFinite(pan.y)) return null;
    return { zoom, pan: { x: pan.x, y: pan.y } };
  }

  private applyCanvasSize(targetSvg: SVGElement): boolean {
    if (!this.canvasWrap) return false;
    const width = this.canvasWrap.clientWidth;
    const height = this.canvasWrap.clientHeight;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return false;
    targetSvg.setAttribute("width", String(width));
    targetSvg.setAttribute("height", String(height));
    return true;
  }

  private restoreViewport(state: { zoom: number; pan: { x: number; y: number } } | null): boolean {
    if (!this.pz || !state) return false;
    this.pz.zoom(state.zoom);
    this.pz.pan(state.pan);
    const restored = this.captureViewportState();
    if (!restored) return false;
    this.lastKnownViewport = restored;
    return true;
  }

  private recoverViewport(): void {
    if (this.restoreViewport(this.lastKnownViewport)) return;
    if (!this.pz) return;
    this.pz.fit();
    this.pz.center();
    this.applyMinInitialZoom();
    const recovered = this.captureViewportState();
    if (recovered) {
      this.lastKnownViewport = recovered;
      return;
    }
    const nodes = this.curStep >= 0 ? this.steps[this.curStep]?.nodes ?? [] : [];
    if (nodes.length) autoZoom(this, nodes);
  }

  private queueViewportSync(): void {
    const targetSvg = this.getDiagramSvg();
    if (!targetSvg) return;

    if (this.viewportSyncRaf !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.viewportSyncRaf);
    }

    const schedule = typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : ((cb: FrameRequestCallback) => {
          cb(0);
          return 0;
        });

    this.viewportSyncRaf = schedule(() => {
      this.viewportSyncRaf = null;
      const desiredState = this.captureViewportState() ?? this.lastKnownViewport;
      if (!this.applyCanvasSize(targetSvg)) return;
      this.pz?.resize();
      if (!this.restoreViewport(desiredState)) this.recoverViewport();
    });
  }

  syncPanelToggleButton(): void {
    if (!this.panelToggleBtn) return;
    const shell = this.getStoryShell();
    const collapsed = shell?.classList.contains("panel-collapsed") ?? false;
    const narrow = shell?.classList.contains("narrow") ?? false;
    this.panelToggleBtn.textContent = narrow
      ? (collapsed ? "∧" : "∨")
      : (collapsed ? "<" : ">");
    this.panelToggleBtn.title = collapsed ? "Expand narration" : "Collapse narration";
    this.panelToggleBtn.setAttribute("aria-label", collapsed ? "Expand narration" : "Collapse narration");
    this.panelToggleBtn.setAttribute("aria-expanded", String(!collapsed));
  }

  togglePanel(): void {
    const storyShell = this.getStoryShell();
    if (!storyShell) return;
    storyShell.classList.toggle("panel-collapsed");
    this.syncPanelToggleButton();
    this.onResize?.();
  }

  bindControls(): void {
    this.doc.querySelectorAll(this.selectors.stepButtons).forEach((btn) => {
      if (btn.hasAttribute("onclick")) return;
      const stepAttr = (btn as HTMLElement & { dataset: DOMStringMap }).dataset["step"] ?? "";
      if (stepAttr === "all") {
        if (this.overview) btn.addEventListener("click", () => this.showOverview(btn));
        return;
      }
      const step = parseInt(stepAttr, 10);
      if (isNaN(step)) return;
      btn.addEventListener("click", () => this.goStep(step, btn));
    });
    if (this.prevBtn && !this.prevBtn.hasAttribute("onclick")) {
      this.prevBtn.addEventListener("click", () => this.goStep(this.curStep - 1));
    }
    if (this.nextBtn && !this.nextBtn.hasAttribute("onclick")) {
      this.nextBtn.addEventListener("click", () => this.goStep(this.curStep + 1));
    }
    if (this.focusBtn && !this.focusBtn.hasAttribute("onclick")) {
      this.focusBtn.addEventListener("click", () => this.toggleFocus());
    }
    if (this.fitBtn && !this.fitBtn.hasAttribute("onclick")) {
      this.fitBtn.addEventListener("click", () => this.resetOverview());
    }
    if (this.panelToggleBtn && !this.panelToggleBtn.hasAttribute("onclick")) {
      this.panelToggleBtn.addEventListener("click", () => this.togglePanel());
    }
    if (this.zoomInBtn && !this.zoomInBtn.hasAttribute("onclick")) {
      this.zoomInBtn.addEventListener("click", () => this.zoomIn());
    }
    if (this.zoomOutBtn && !this.zoomOutBtn.hasAttribute("onclick")) {
      this.zoomOutBtn.addEventListener("click", () => this.zoomOut());
    }
  }

  exposeInlineApi(): void {
    if (!this.exposeGlobals) return;
    const win = window as Window & {
      viewer?: DiaScopeViewer;
      goStep?: (idx: number, btn?: Element | null) => void;
      toggleFocus?: () => void;
      resetOverview?: () => void;
      togglePanel?: () => void;
      hideDetail?: () => void;
      pz?: SvgPanZoom | null;
    };
    win.viewer = this;
    win.goStep = (idx, btn = null) => this.goStep(idx, btn);
    win.toggleFocus = () => this.toggleFocus();
    win.resetOverview = () => this.resetOverview();
    win.togglePanel = () => this.togglePanel();
    win.hideDetail = () => this.hideDetail();
    win.pz = this.pz;
  }

  init(): void {
    this.canvasWrap = this.doc.querySelector(this.selectors.canvasWrap);
    this.svgHost = this.doc.querySelector(this.selectors.svgHost);
    this.stepTagEl = this.doc.querySelector(this.selectors.stepTag);
    this.stepTitleEl = this.doc.querySelector(this.selectors.stepTitle);
    this.stepBodyEl = this.doc.querySelector(this.selectors.stepBody);
    this.prevBtn = this.doc.querySelector(this.selectors.prevBtn);
    this.nextBtn = this.doc.querySelector(this.selectors.nextBtn);
    this.focusBtn = this.doc.querySelector(this.selectors.focusBtn);
    this.fitBtn = this.doc.querySelector(this.selectors.fitBtn);
    this.panelToggleBtn = this.doc.querySelector(this.selectors.panelToggleBtn);
    this.zoomInBtn = this.doc.querySelector(this.selectors.zoomInBtn);
    this.zoomOutBtn = this.doc.querySelector(this.selectors.zoomOutBtn);
    this.detailDrawerEl = this.doc.querySelector(this.selectors.detailDrawer);
    this.drawerNodeIdEl = this.doc.querySelector(this.selectors.drawerNodeId);
    this.drawerBodyEl = this.doc.querySelector(this.selectors.drawerBody);
    this.edgeTooltipEl = this.doc.querySelector(this.selectors.edgeTooltip);

    if (!this.canvasWrap || !this.svgHost || !this.svgPanZoomImpl) return;
    const targetSvg = this.getDiagramSvg();
    if (!targetSvg) return;

    this.applyCanvasSize(targetSvg);
    this.onResize = () => this.queueViewportSync();
    window.addEventListener("resize", this.onResize);

    const { onUpdatedCTM: userOnUpdatedCTM, ...panZoomOptions } = this.panZoomOptions as Record<string, unknown> & {
      onUpdatedCTM?: ((ctm: { a: number; e: number; f: number }) => void);
    };

    this.pz = this.svgPanZoomImpl(targetSvg, {
      zoomEnabled: true,
      controlIconsEnabled: false,
      fit: true,
      center: true,
      minZoom: this.panZoomMin,
      maxZoom: this.panZoomMax,
      zoomScaleSensitivity: 0.15,
      ...panZoomOptions,
      onUpdatedCTM: (ctm: { a: number; e: number; f: number }) => {
        if (Number.isFinite(ctm.a) && ctm.a > 0 && Number.isFinite(ctm.e) && Number.isFinite(ctm.f)) {
          this.lastKnownViewport = { zoom: ctm.a, pan: { x: ctm.e, y: ctm.f } };
        }
        userOnUpdatedCTM?.(ctm);
      },
    });
    this.applyMinInitialZoom();
    this.lastKnownViewport = this.captureViewportState();

    if (typeof ResizeObserver !== "undefined") {
      this.canvasObserver = new ResizeObserver(() => this.onResize?.());
      this.canvasObserver.observe(this.canvasWrap);
    }

    tagNodes(this);
    tagEdges(this);
    setupEdgeTooltips(this);

    this.onCanvasClick = (e: MouseEvent) => {
      if (!e.target || !(e.target instanceof Element)) return;
      if (!e.target.closest(this.selectors.detailDrawer) && !e.target.closest(".d2-node")) {
        this.hideTransientUI();
      }
    };
    this.canvasWrap.addEventListener("click", this.onCanvasClick);

    bindKeyboard(this);
    if (this.autoBindControls) this.bindControls();
    this.syncPanelToggleButton();

    // Start at overview when configured at 'first' position; otherwise start at step 0
    if (this.overview && this.overview.position !== 'last') {
      this.showOverview(this.doc.querySelector(`${this.selectors.stepButtons}[data-step="all"]`));
    } else {
      this.goStep(0, this.doc.querySelector(`${this.selectors.stepButtons}[data-step="0"]`));
      applyHighlight(this, this.steps[0]?.nodes ?? []);
    }
    this.exposeInlineApi();
    if (this.expandable) this.setupExpandButton();
    this.setupNarrowObserver();
  }

  setupNarrowObserver(): void {
    if (this.narrowBreakpoint <= 0 || typeof ResizeObserver === "undefined") return;
    const shell = this.getStoryShell();
    if (!shell) return;
    this.narrowObserver = new ResizeObserver(([e]) => {
      const wasNarrow = shell.classList.contains("narrow");
      shell.classList.toggle("narrow", (e.contentRect.width) < this.narrowBreakpoint);
      const isNarrow = shell.classList.contains("narrow");
      this.syncPanelToggleButton();
      // Layout mode changes alter the real canvas size; queue a re-sync if there is no canvas observer.
      if (wasNarrow !== isNarrow && !this.canvasObserver) this.onResize?.();
    });
    this.narrowObserver.observe(shell);
  }

  setupExpandButton(): void {
    if (!this.canvasWrap) return;
    let btn = this.doc.getElementById("btn-expand") as HTMLButtonElement | null;
    if (!btn) {
      btn = this.doc.createElement("button") as HTMLButtonElement;
      btn.id = "btn-expand";
      btn.style.cssText = "position:absolute;top:10px;right:10px;z-index:20;width:28px;height:28px;border-radius:999px;border:1px solid #cbd5e0;background:rgba(255,255,255,0.92);color:#4a5568;cursor:pointer;padding:0;";
      this.canvasWrap.appendChild(btn);
    }
    const expandIcon = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="9,1 13,1 13,5"/><polyline points="5,13 1,13 1,9"/><line x1="13" y1="1" x2="8" y2="6"/><line x1="1" y1="13" x2="6" y2="8"/></svg>`;
    const collapseIcon = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="1,5 1,1 5,1"/><polyline points="9,13 13,13 13,9"/><line x1="1" y1="1" x2="6" y2="6"/><line x1="13" y1="13" x2="8" y2="8"/></svg>`;
    const fullscreenTarget =
      (this.getStoryShell() ?? this.canvasWrap ?? this.doc.documentElement) as (Element & {
        requestFullscreen?: () => Promise<void>;
      });
    const syncIcon = () => {
      const isFs = !!this.doc.fullscreenElement;
      btn!.innerHTML = isFs ? collapseIcon : expandIcon;
      btn!.title = isFs ? "Exit full view" : "Open in full view";
      btn!.setAttribute("aria-label", isFs ? "Exit full view" : "Open in full view");
    };
    syncIcon();
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.addEventListener("click", async () => {
      if (this.doc.fullscreenElement) {
        void this.doc.exitFullscreen();
        return;
      }
      try {
        if (fullscreenTarget.requestFullscreen) {
          await fullscreenTarget.requestFullscreen();
          return;
        }
      } catch {
        // Fallback handled below for embeds that block fullscreen.
      }
      const win = this.doc.defaultView;
      if (win?.open) {
        const url = new URL(win.location.href);
        url.searchParams.delete("expandable");
        win.open(url.toString(), "_blank", "noopener,noreferrer");
      }
    });
    this.doc.addEventListener("fullscreenchange", () => {
      syncIcon();
      this.onResize?.();
    });
  }

  destroy(): void {
    if (this.onResize) window.removeEventListener("resize", this.onResize);
    if (this.onMouseMove) this.doc.removeEventListener("mousemove", this.onMouseMove);
    if (this.onCanvasClick && this.canvasWrap) this.canvasWrap.removeEventListener("click", this.onCanvasClick);
    if (this.onKeyDown) this.doc.removeEventListener("keydown", this.onKeyDown);
    if (this.zoomRaf) cancelAnimationFrame(this.zoomRaf);
    if (this.viewportSyncRaf !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.viewportSyncRaf);
    this.narrowObserver?.disconnect();
    this.canvasObserver?.disconnect();
    this.pz?.destroy?.();
  }
}
