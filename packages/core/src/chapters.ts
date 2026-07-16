import type { Scene } from "./schema.js";

export interface ChapterGroup {
  chapter: string | null;
  scenes: Scene[];
}

/**
 * Groups scenes by consecutive run of the same `chapter` value. A chapterless scene
 * (`chapter === undefined`) never merges with its neighbors — even two adjacent chapterless
 * scenes stay as separate single-scene groups — so grouping only ever happens where an author
 * explicitly opts in via matching `chapter` values. Order-preserving: a chapter value repeated
 * non-consecutively produces separate groups, never merged across the gap.
 */
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
