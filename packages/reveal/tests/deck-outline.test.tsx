import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import type { NarrativeDocument } from "@diascope/core";
import type { ReactNode } from "react";

vi.mock("@revealjs/react", () => ({
  Slide: ({ children }: { children?: ReactNode }) => <section data-testid="slide">{children}</section>,
  Stack: ({ children }: { children?: ReactNode }) => <div data-testid="stack">{children}</div>,
}));
vi.mock("../src/NarrativeScene.js", () => ({
  NarrativeScene: (props: { sceneId: string }) => <div data-testid="scene" data-scene-id={props.sceneId} />,
}));

const { DeckOutline } = await import("../src/DeckOutline.js");

function doc(scenes: { id: string; chapter?: string }[]): NarrativeDocument {
  return {
    version: 1,
    graph: { source: "g.d2" },
    scenes: scenes.map(s => ({
      id: s.id,
      layout: "two-pane" as const,
      steps: [{ id: `${s.id}-s0` }],
      ...(s.chapter ? { chapter: s.chapter } : {}),
    })),
  };
}

describe("DeckOutline", () => {
  it("renders one bare Slide per chapterless scene, in order", () => {
    const { container } = render(<DeckOutline doc={doc([{ id: "a" }, { id: "b" }])} d2Source="src" />);
    const slides = container.querySelectorAll('[data-testid="slide"]');
    expect(slides.length).toBe(2);
    expect(container.querySelectorAll('[data-testid="stack"]').length).toBe(0);
    expect(slides[0].querySelector('[data-testid="scene"]')?.getAttribute("data-scene-id")).toBe("a");
    expect(slides[1].querySelector('[data-testid="scene"]')?.getAttribute("data-scene-id")).toBe("b");
  });

  it("wraps a same-chapter run in one Stack of Slides", () => {
    const { container } = render(
      <DeckOutline doc={doc([{ id: "a", chapter: "intro" }, { id: "b", chapter: "intro" }, { id: "c" }])} d2Source="src" />
    );
    const stacks = container.querySelectorAll('[data-testid="stack"]');
    expect(stacks.length).toBe(1);
    expect(stacks[0].querySelectorAll('[data-testid="slide"]').length).toBe(2);
    // The chapterless scene "c" is a bare Slide, a sibling of the stack, not inside it: DeckOutline
    // returns a Fragment, so both the Stack and scene "c"'s Slide land as direct children of
    // `container` — filtering those direct children excludes the 2 Slides nested inside the Stack.
    const topLevelSlides = Array.from(container.children).filter(
      el => el.getAttribute("data-testid") === "slide"
    );
    expect(topLevelSlides.length).toBe(1);
  });

  it("renders an optional leading title slide before the outline when provided", () => {
    const { container } = render(
      <DeckOutline doc={doc([{ id: "a" }])} d2Source="src" renderTitleSlide={() => <h1>Title</h1>} />
    );
    const slides = container.querySelectorAll('[data-testid="slide"]');
    expect(slides.length).toBe(1); // renderTitleSlide returns a bare <h1>, not wrapped in the mocked Slide
    expect(container.textContent).toContain("Title");
  });

  it("renders nothing extra when renderTitleSlide is omitted", () => {
    const { container } = render(<DeckOutline doc={doc([{ id: "a" }])} d2Source="src" />);
    expect(container.querySelectorAll('[data-testid="slide"]').length).toBe(1);
    expect(container.textContent).not.toContain("Title");
  });
});
