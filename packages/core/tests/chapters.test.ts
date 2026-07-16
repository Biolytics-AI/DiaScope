import { describe, it, expect } from "vitest";
import type { Scene } from "../src/schema.js";
import { groupIntoChapters } from "../src/chapters.js";

const scene = (id: string, chapter?: string): Scene => ({
  id, layout: "two-pane", steps: [{ id: `${id}-s0` }], ...(chapter ? { chapter } : {}),
});

describe("groupIntoChapters", () => {
  it("returns [] for no scenes", () => {
    expect(groupIntoChapters([])).toEqual([]);
  });

  it("chapterless scenes each get their own single-scene group", () => {
    const groups = groupIntoChapters([scene("a"), scene("b"), scene("c")]);
    expect(groups).toEqual([
      { chapter: null, scenes: [scene("a")] },
      { chapter: null, scenes: [scene("b")] },
      { chapter: null, scenes: [scene("c")] },
    ]);
  });

  it("consecutive scenes sharing a chapter merge into one group, in order", () => {
    const groups = groupIntoChapters([scene("a", "intro"), scene("b", "intro"), scene("c")]);
    expect(groups.map(g => g.chapter)).toEqual(["intro", null]);
    expect(groups[0].scenes.map(s => s.id)).toEqual(["a", "b"]);
    expect(groups[1].scenes.map(s => s.id)).toEqual(["c"]);
  });

  it("a chapter value repeated NON-consecutively does not merge the two runs", () => {
    const groups = groupIntoChapters([scene("a", "x"), scene("b", "y"), scene("c", "x")]);
    expect(groups.map(g => g.chapter)).toEqual(["x", "y", "x"]);
    expect(groups.map(g => g.scenes.map(s => s.id))).toEqual([["a"], ["b"], ["c"]]);
  });

  it("mixes chaptered and chapterless scenes correctly", () => {
    const groups = groupIntoChapters([scene("a"), scene("b", "mid"), scene("c", "mid"), scene("d")]);
    expect(groups.map(g => ({ chapter: g.chapter, ids: g.scenes.map(s => s.id) }))).toEqual([
      { chapter: null, ids: ["a"] },
      { chapter: "mid", ids: ["b", "c"] },
      { chapter: null, ids: ["d"] },
    ]);
  });
});
