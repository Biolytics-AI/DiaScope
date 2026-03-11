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

  zoomIn(): void {
    this.pz?.zoomIn();
  }

  zoomOut(): void {
    this.pz?.zoomOut();
  }

  getStoryShell(): HTMLElement | null {
    return this.doc.querySelector("#story-shell");
  }

  syncPanelToggleButton(): void {
    if (!this.panelToggleBtn) return;
    const collapsed = this.getStoryShell()?.classList.contains("panel-collapsed") ?? false;
    this.panelToggleBtn.textContent = collapsed ? "<" : ">";
    this.panelToggleBtn.title = collapsed ? "Expand narration" : "Collapse narration";
    this.panelToggleBtn.setAttribute("aria-label", collapsed ? "Expand narration" : "Collapse narration");
    this.panelToggleBtn.setAttribute("aria-expanded", String(!collapsed));
  }

  togglePanel(): void {
    const storyShell = this.getStoryShell();
    if (!storyShell) return;
    storyShell.classList.toggle("panel-collapsed");
    this.syncPanelToggleButton();
    this.pz?.resize();
    this.pz?.fit();
    this.pz?.center();
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

    const resize = () => {
      if (!this.canvasWrap) return;
      targetSvg.setAttribute("width", String(this.canvasWrap.clientWidth));
      targetSvg.setAttribute("height", String(this.canvasWrap.clientHeight));
      this.pz?.resize();
    };
    resize();
    this.onResize = () => { resize(); this.pz?.fit(); this.pz?.center(); };
    window.addEventListener("resize", this.onResize);

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
    this.syncPanelToggleButton();

    this.goStep(0, this.doc.querySelector(`${this.selectors.stepButtons}[data-step="0"]`));
    applyHighlight(this, this.steps[0]?.nodes ?? []);
    this.exposeInlineApi();
    if (this.expandable) this.setupExpandButton();
  }

  setupExpandButton(): void {
    if (!this.canvasWrap) return;
    let btn = this.doc.getElementById("btn-expand") as HTMLButtonElement | null;
    if (!btn) {
      btn = this.doc.createElement("button") as HTMLButtonElement;
      btn.id = "btn-expand";
      btn.style.cssText = "position:absolute;top:10px;right:10px;z-index:20;width:28px;height:28px;border-radius:999px;border:1px solid #4a5568;background:rgba(22,27,39,0.92);color:#a0aec0;cursor:pointer;padding:0;";
      this.canvasWrap.appendChild(btn);
    }
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="9,1 13,1 13,5"/><polyline points="5,13 1,13 1,9"/><line x1="13" y1="1" x2="8" y2="6"/><line x1="1" y1="13" x2="6" y2="8"/></svg>`;
    btn.title = "Open in full view";
    btn.setAttribute("aria-label", "Open in full view");
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.addEventListener("click", () => {
      const url = window.location.href.replace(/[?&]expandable=?1?/, "").replace(/\?$/, "");
      window.open(url, "_blank");
    });
  }

  destroy(): void {
    if (this.onResize) window.removeEventListener("resize", this.onResize);
    if (this.onMouseMove) this.doc.removeEventListener("mousemove", this.onMouseMove);
    if (this.onCanvasClick && this.canvasWrap) this.canvasWrap.removeEventListener("click", this.onCanvasClick);
    if (this.onKeyDown) this.doc.removeEventListener("keydown", this.onKeyDown);
    if (this.zoomRaf) cancelAnimationFrame(this.zoomRaf);
    this.pz?.destroy?.();
  }
}
