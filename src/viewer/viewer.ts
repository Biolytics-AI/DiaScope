import { applyHighlight } from "./highlight.js";
import { goStep, toggleFocus, resetOverview, bindKeyboard } from "./navigation.js";
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
  fullscreenBtn: "#btn-fullscreen",
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
  fullscreenBtn: HTMLButtonElement | null = null;
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
  onFullscreenChange: (() => void) | null = null;

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

  goStep(idx: number, btn: Element | null = null): void {
    goStep(this, idx, btn);
  }

  toggleFocus(): void {
    toggleFocus(this);
  }

  resetOverview(): void {
    resetOverview(this);
  }

  getFullscreenHost(): HTMLElement | null {
    return this.doc.querySelector("#story-shell");
  }

  syncFullscreenButton(): void {
    if (!this.fullscreenBtn) return;
    const inFullscreen = this.doc.fullscreenElement === this.getFullscreenHost();
    this.fullscreenBtn.textContent = inFullscreen ? "Exit Fullscreen" : "Fullscreen";
    this.fullscreenBtn.title = inFullscreen
      ? "Exit fullscreen viewer mode"
      : "Expand the whole story viewer to fullscreen";
  }

  async toggleFullscreen(): Promise<void> {
    const host = this.getFullscreenHost();
    if (!host) return;
    if (this.doc.fullscreenElement === host) {
      if (this.doc.exitFullscreen) await this.doc.exitFullscreen();
    } else if (host.requestFullscreen) {
      await host.requestFullscreen();
    }
    this.syncFullscreenButton();
    this.pz?.resize();
    this.pz?.fit();
    this.pz?.center();
  }

  zoomIn(): void {
    this.pz?.zoomIn();
  }

  zoomOut(): void {
    this.pz?.zoomOut();
  }

  bindControls(): void {
    this.doc.querySelectorAll(this.selectors.stepButtons).forEach((btn) => {
      if (btn.hasAttribute("onclick")) return;
      const step = parseInt((btn as HTMLElement & { dataset: DOMStringMap }).dataset["step"] ?? "", 10);
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
    if (this.fullscreenBtn && !this.fullscreenBtn.hasAttribute("onclick")) {
      this.fullscreenBtn.addEventListener("click", () => {
        void this.toggleFullscreen();
      });
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
      toggleFullscreen?: () => Promise<void>;
      hideDetail?: () => void;
      pz?: SvgPanZoom | null;
    };
    win.viewer = this;
    win.goStep = (idx, btn = null) => this.goStep(idx, btn);
    win.toggleFocus = () => this.toggleFocus();
    win.resetOverview = () => this.resetOverview();
    win.toggleFullscreen = () => this.toggleFullscreen();
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
    this.fullscreenBtn = this.doc.querySelector(this.selectors.fullscreenBtn);
    this.zoomInBtn = this.doc.querySelector(this.selectors.zoomInBtn);
    this.zoomOutBtn = this.doc.querySelector(this.selectors.zoomOutBtn);
    this.detailDrawerEl = this.doc.querySelector(this.selectors.detailDrawer);
    this.drawerNodeIdEl = this.doc.querySelector(this.selectors.drawerNodeId);
    this.drawerBodyEl = this.doc.querySelector(this.selectors.drawerBody);
    this.edgeTooltipEl = this.doc.querySelector(this.selectors.edgeTooltip);

    if (!this.canvasWrap || !this.svgHost || !this.svgPanZoomImpl) return;
    const targetSvg = this.getDiagramSvg();
    if (!targetSvg) return;

    const resize = () => {
      if (!this.canvasWrap) return;
      targetSvg.setAttribute("width", String(this.canvasWrap.clientWidth));
      targetSvg.setAttribute("height", String(this.canvasWrap.clientHeight));
      this.pz?.resize();
    };
    resize();
    this.onResize = () => { resize(); this.pz?.fit(); this.pz?.center(); };
    window.addEventListener("resize", this.onResize);
    this.onFullscreenChange = () => {
      this.syncFullscreenButton();
      resize();
      this.pz?.fit();
      this.pz?.center();
    };
    this.doc.addEventListener("fullscreenchange", this.onFullscreenChange);

    this.pz = this.svgPanZoomImpl(targetSvg, {
      zoomEnabled: true,
      controlIconsEnabled: false,
      fit: true,
      center: true,
      minZoom: this.panZoomMin,
      maxZoom: this.panZoomMax,
      zoomScaleSensitivity: 0.3,
      ...this.panZoomOptions,
    });

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
    this.syncFullscreenButton();

    this.goStep(0, this.doc.querySelector(`${this.selectors.stepButtons}[data-step="0"]`));
    applyHighlight(this, this.steps[0]?.nodes ?? []);
    this.exposeInlineApi();
  }

  destroy(): void {
    if (this.onResize) window.removeEventListener("resize", this.onResize);
    if (this.onMouseMove) this.doc.removeEventListener("mousemove", this.onMouseMove);
    if (this.onCanvasClick && this.canvasWrap) this.canvasWrap.removeEventListener("click", this.onCanvasClick);
    if (this.onKeyDown) this.doc.removeEventListener("keydown", this.onKeyDown);
    if (this.onFullscreenChange) this.doc.removeEventListener("fullscreenchange", this.onFullscreenChange);
    if (this.zoomRaf) cancelAnimationFrame(this.zoomRaf);
    this.pz?.destroy?.();
  }
}
