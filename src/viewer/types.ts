export interface Step {
  /** Short label shown in step pill UI, e.g. "01" */
  tag?: string;
  /** Headline shown in the narration panel */
  title?: string;
  /** Body text/HTML shown in the narration panel */
  body?: string;
  /** D2 node IDs to highlight in this step */
  nodes?: string[];
}

export interface ViewerSelectors {
  canvasWrap?: string;
  svgHost?: string;
  targetSvg?: string;
  stepButtons?: string;
  stepTag?: string;
  stepTitle?: string;
  stepBody?: string;
  prevBtn?: string;
  nextBtn?: string;
  focusBtn?: string;
  fitBtn?: string;
  panelToggleBtn?: string;
  zoomInBtn?: string;
  zoomOutBtn?: string;
  detailDrawer?: string;
  drawerNodeId?: string;
  drawerBody?: string;
  edgeTooltip?: string;
}

export interface ViewerOptions {
  steps?: Step[];
  /** All D2 node IDs present in the diagram */
  nodeIds?: string[];
  /** Map of nodeId → HTML string for click-to-expand detail drawer */
  detailPanels?: Record<string, string>;
  /** Map of edge label → HTML string for hover tooltip */
  edgeTooltips?: Record<string, string>;
  selectors?: ViewerSelectors;
  contextNodeOpacity?: string;
  contextEdgeOpacity?: string;
  zoomFill?: number;
  zoomFrames?: number;
  panZoomMin?: number;
  panZoomMax?: number;
  panZoomOptions?: Record<string, unknown>;
  exposeGlobals?: boolean;
  autoBindControls?: boolean;
  /** Show a pop-out button in the top-right corner of the canvas. Useful when embedded via iframe. */
  expandable?: boolean;
  document?: Document;
  /** svgPanZoom instance or compatible impl */
  svgPanZoom?: (svg: SVGElement, options: Record<string, unknown>) => SvgPanZoom;
}

/** Minimal interface for svgPanZoom compatibility */
export interface SvgPanZoom {
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
  center(): void;
  resize(): void;
  getZoom(): number;
  getPan(): { x: number; y: number };
  zoom(scale: number): void;
  pan(point: { x: number; y: number }): void;
  destroy?(): void;
}
