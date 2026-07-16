# DiaScope v2 — Document-Driven Reveal Chapters (sub-project 3)

**Date:** 2026-07-16
**Status:** Approved (v1, fast-tracked per user request)
**Scope:** Sub-project 3 of 3. Independent of sub-projects 1 (explore mode, shipped) and
2 (audience lenses).

## Summary

Today, `demo/deck/src/App.tsx` hand-wires reveal structure: the first scene becomes a plain
horizontal `Slide`, every remaining scene is dumped into one vertical `Stack`. That's
demo-app code, not something the narrative document expresses — every new deck author has to
reinvent (or copy-paste) the same wiring, and there's no way to express "these three scenes
are one chapter, but this fourth scene starts a new chapter" without editing `App.tsx` by hand.

## Schema addition (backward compatible)

```ts
export const SceneSchema = z.strictObject({
  id: z.string().min(1),
  chapter: z.string().optional(),   // NEW
  layout: z.literal("two-pane").default("two-pane"),
  // ...unchanged
});
```

Scenes with no `chapter` are unaffected — see grouping rule below, which degrades to today's
"first scene horizontal, rest stacked" behavior when no scene sets `chapter`.

**Grouping rule:** scenes are grouped by consecutive run of the same `chapter` value (including
`undefined` treated as its own value per scene, i.e. two adjacent chapterless scenes do **not**
implicitly group — every chapterless scene is its own single-slide chapter, matching current
behavior of "everything is separately meaningful unless explicitly grouped"). Each group of ≥2
same-chapter scenes becomes one horizontal slide's vertical `Stack`; each group of exactly 1
scene becomes a plain horizontal `Slide`. This is a pure function over `doc.scenes` — order
in the array is the deck's horizontal order.

```ts
// packages/core/src/chapters.ts
export interface ChapterGroup { chapter: string | null; scenes: Scene[] }

export function groupIntoChapters(scenes: Scene[]): ChapterGroup[] {
  const groups: ChapterGroup[] = [];
  for (const scene of scenes) {
    const last = groups[groups.length - 1];
    if (last && scene.chapter !== undefined && last.chapter === scene.chapter) {
      last.scenes.push(scene);
    } else {
      groups.push({ chapter: scene.chapter ?? null, scenes: [scene] });
    }
  }
  return groups;
}
```

Lives in `@diascope/core` (unlike sub-projects 1/2's renderer-only helpers) because chapter
grouping is a property of the **document's structure**, not of viewer interaction — it belongs
next to the document model, and a future CLI command (`diascope2 outline <doc.yaml>`, printing
the chapter/scene tree) or the eventual GUI's slide-map both want this without depending on
`@diascope/react`.

## `@diascope/reveal`: deck-building helper

```tsx
// packages/reveal/src/DeckOutline.tsx
export interface DeckOutlineProps {
  doc: NarrativeDocument;
  d2Source: string;
  renderTitleSlide?: () => ReactNode;   // optional leading Slide, e.g. a cover
}

export function DeckOutline({ doc, d2Source, renderTitleSlide }: DeckOutlineProps) {
  const groups = groupIntoChapters(doc.scenes);
  return (
    <>
      {renderTitleSlide?.()}
      {groups.map(group =>
        group.scenes.length > 1 ? (
          <Stack key={group.scenes[0].id}>
            {group.scenes.map(s => (
              <Slide key={s.id}><NarrativeScene d2Source={d2Source} doc={doc} sceneId={s.id} /></Slide>
            ))}
          </Stack>
        ) : (
          <Slide key={group.scenes[0].id}><NarrativeScene d2Source={d2Source} doc={doc} sceneId={group.scenes[0].id} /></Slide>
        )
      )}
    </>
  );
}
```

This is the ONE new `@diascope/reveal` export for this sub-project. It composes with the
existing "one `NarrativeScene` per `Slide`" hard constraint (documented in `docs/authoring.md`)
— `DeckOutline` is exactly what enforces that constraint correctly by construction, so deck
authors no longer need to hand-verify it.

`demo/deck/src/App.tsx` is simplified to:

```tsx
<Deck config={{...}} plugins={[DiaScopeRevealPlugin]} onReady={...}>
  <DeckOutline
    doc={doc}
    d2Source={d2}
    renderTitleSlide={() => <Slide><h2>{doc.scenes[0].text?.title}</h2>...</Slide>}
  />
</Deck>
```

**Decision: every chapterless scene is its own slide** — this changes the demo deck's current
default topology (today: first scene alone, all remaining scenes dumped into one stack
regardless of relatedness) rather than preserving it as a special case. Chosen because it's the
more predictable rule with no hidden "first scene is special" carve-out: a document with zero
`chapter` tags gets a fully horizontal deck (every scene its own slide, no implicit stacking),
and stacking only happens where an author explicitly opts in via matching `chapter` values.
Migrating the demo deck to this new default means adding `chapter` to whichever of its scenes
should stay grouped (e.g. tag the vLLM demo's non-title scenes with the same `chapter` value to
reproduce today's visual grouping) — a one-line-per-scene change in `demo/deck/scenes/vllm.yaml`
done as part of this sub-project's implementation, not a follow-up.

## Testing

Unit (`packages/core/tests/chapters.test.ts`): empty input → `[]`; all-chapterless scenes →
one group per scene; consecutive same-chapter scenes → one group; a chapter value repeated
non-consecutively (e.g. `A, B, A`) → does NOT merge the two `A` runs (order-preserving, no
implicit reordering — two separate groups). Component: `DeckOutline` renders a `Stack` only for
groups of size ≥2, a bare `Slide` for size 1, in document order. Browser: apply `chapter` to the
existing vLLM demo (group its two non-title scenes into one chapter, matching today's visual
stack), re-run the full layout suite — zero regression.

## Out of scope for v1

Chapter-level UI chrome (a horizontal progress indicator, chapter titles in reveal's own
progress bar), nested/multi-level chapters, reordering chapters independent of `scenes` array
order.
