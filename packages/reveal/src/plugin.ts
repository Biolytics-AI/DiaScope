/**
 * Minimal reveal.js plugin: marks the deck root so host CSS/tooling can target a
 * DiaScope-enabled presentation. All actual step/graph sync happens per-scene in
 * NarrativeScene, not here — reveal.js plugins run once per deck, while DiaScope state is
 * scoped per NarrativeScene instance.
 */
export interface RevealDeckLike {
  getRevealElement(): HTMLElement | null;
}

export const DiaScopeRevealPlugin = {
  id: "diascope",
  init(deck: RevealDeckLike) {
    deck.getRevealElement()?.classList.add("diascope-enabled");
  },
};
