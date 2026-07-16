import type { ReactNode } from "react";
import { Slide, Stack } from "@revealjs/react";
import type { NarrativeDocument } from "@diascope/core";
import { groupIntoChapters } from "@diascope/core";
import type { D2Compiler } from "@diascope/d2";
import { NarrativeScene } from "./NarrativeScene.js";

export interface DeckOutlineProps {
  doc: NarrativeDocument;
  d2Source: string;
  compiler?: D2Compiler;
  /** An optional leading slide (e.g. a cover), rendered before the chapter outline exactly as
   *  returned — DeckOutline does not wrap it in a Slide itself, so the caller controls that. */
  renderTitleSlide?: () => ReactNode;
}

/**
 * Builds the reveal.js Slide/Stack tree from a document's scenes, grouped by `groupIntoChapters`
 * (consecutive same-`chapter` runs become one horizontal slide's vertical Stack; every other
 * scene is its own bare Slide). This is also what correctly enforces the "one NarrativeScene per
 * Slide" constraint by construction — deck authors no longer hand-verify it.
 */
export function DeckOutline({ doc, d2Source, compiler, renderTitleSlide }: DeckOutlineProps) {
  const groups = groupIntoChapters(doc.scenes);
  return (
    <>
      {renderTitleSlide?.()}
      {groups.map(group =>
        group.scenes.length > 1 ? (
          <Stack key={group.scenes[0].id}>
            {group.scenes.map(s => (
              <Slide key={s.id}>
                <NarrativeScene d2Source={d2Source} doc={doc} sceneId={s.id} compiler={compiler} />
              </Slide>
            ))}
          </Stack>
        ) : (
          <Slide key={group.scenes[0].id}>
            <NarrativeScene d2Source={d2Source} doc={doc} sceneId={group.scenes[0].id} compiler={compiler} />
          </Slide>
        )
      )}
    </>
  );
}
