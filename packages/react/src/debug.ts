export interface LayoutEntry {
  part: string;
  id: string | null;
  target: string | null;
  rect: { x: number; y: number; width: number; height: number };
}

declare global {
  interface Window {
    __diascopeDebug?: { layout(): LayoutEntry[] };
  }
}

// Every mounted TwoPaneScene registers its root element here so window.__diascopeDebug.layout()
// can report on all of them (normally there's just one, but nothing prevents multiple scenes
// being mounted at once, e.g. in a storybook-style gallery).
const roots = new Set<HTMLElement>();

/**
 * Registers `root` with the global debug layout hook, creating `window.__diascopeDebug` on
 * first call. Task 17's Playwright bounding-box verification reads this to assert that
 * scene/canvas/pane/pill-row/popover/drawer/tooltip parts land where the design expects.
 *
 * Roots that get disconnected from the document (e.g. after unmount) are pruned lazily the
 * next time layout() runs, rather than requiring an explicit uninstall call.
 */
export function installLayoutDebug(root: HTMLElement): void {
  roots.add(root);
  if (typeof window === "undefined") return;
  window.__diascopeDebug = {
    layout(): LayoutEntry[] {
      const out: LayoutEntry[] = [];
      for (const r of roots) {
        if (!r.isConnected) {
          roots.delete(r);
          continue;
        }
        // Report only the on-screen scene. In a reveal.js deck every mounted scene stays
        // display:block, stacked at the same position, with non-present ones faded to
        // opacity 0 on an ancestor <section> — so without this filter every scene's parts
        // would be returned superimposed and layout verification would compare a mix of
        // scenes. checkVisibility walks ancestors for opacity/visibility/display/content-
        // visibility; jsdom (unit tests) has no checkVisibility, where the single directly-
        // rendered scene is always on-screen, so the guard simply includes it.
        const checkVisibility = (r as unknown as {
          checkVisibility?: (opts?: {
            opacityProperty?: boolean;
            visibilityProperty?: boolean;
            contentVisibilityAuto?: boolean;
          }) => boolean;
        }).checkVisibility;
        if (
          typeof checkVisibility === "function" &&
          !checkVisibility.call(r, {
            opacityProperty: true,
            visibilityProperty: true,
            contentVisibilityAuto: true,
          })
        ) {
          continue;
        }
        const els = [r, ...r.querySelectorAll<HTMLElement>("[data-diascope-part]")];
        for (const el of els) {
          const part = el.getAttribute("data-diascope-part");
          if (!part) continue;
          const b = el.getBoundingClientRect();
          out.push({
            part,
            id: el.getAttribute("data-diascope-id"),
            target: el.getAttribute("data-diascope-target"),
            rect: { x: b.x, y: b.y, width: b.width, height: b.height },
          });
        }
      }
      return out;
    },
  };
}
