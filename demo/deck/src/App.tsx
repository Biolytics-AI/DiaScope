import { useEffect, useState } from "react";
import { Deck, Slide, Stack } from "@revealjs/react";
import { loadDocument, type NarrativeDocument } from "@diascope/core";
import { NarrativeScene, DiaScopeRevealPlugin } from "@diascope/reveal";
import d2Source from "../../../examples/vLLM/deployment.d2?raw";
import docYaml from "../scenes/vllm.yaml?raw";

const builtinDoc = loadDocument(docYaml);

interface Story { doc: NarrativeDocument; d2: string }

function useStory(): Story | "loading" | "builtin" {
  const slug = new URLSearchParams(location.search).get("story");
  const [story, setStory] = useState<Story | "loading" | "builtin">(slug ? "loading" : "builtin");
  useEffect(() => {
    if (!slug) return;
    Promise.all([
      fetch(`/stories/${slug}/story.yaml`).then(r => { if (!r.ok) throw new Error(`story.yaml: ${r.status}`); return r.text(); }),
      fetch(`/stories/${slug}/diagram.d2`).then(r => { if (!r.ok) throw new Error(`diagram.d2: ${r.status}`); return r.text(); }),
    ]).then(([yamlText, d2Text]) => setStory({ doc: loadDocument(yamlText), d2: d2Text }))
      .catch(err => { console.error("Failed to load story:", err); setStory("builtin"); });
  }, [slug]);
  return story;
}

export function App() {
  const story = useStory();
  if (story === "loading") return <p style={{ color: "#ccc", padding: "2rem" }}>Loading story…</p>;
  const doc = story === "builtin" ? builtinDoc : story.doc;
  const d2 = story === "builtin" ? d2Source : story.d2;
  const [first, ...rest] = doc.scenes;
  return (
    <Deck config={{ hash: true, transition: "fade", controls: true, progress: true, width: 1280, height: 720, margin: 0, center: false }}
      plugins={[DiaScopeRevealPlugin]}
      onReady={deck => { (window as unknown as { deck: unknown }).deck = deck; }}>
      <Slide>
        <div className="deck-title">
          <span className="deck-title-rule" aria-hidden="true" />
          <h2>{first.text?.title ?? "DiaScope v2"}</h2>
          <p className="deck-title-sub">Graph-native narrative over reveal.js</p>
          <p className="deck-title-hint">→ to begin</p>
        </div>
      </Slide>
      <Slide><NarrativeScene d2Source={d2} doc={doc} sceneId={first.id} /></Slide>
      {rest.length > 0 && (
        <Stack>
          {rest.map(s => (
            <Slide key={s.id}><NarrativeScene d2Source={d2} doc={doc} sceneId={s.id} /></Slide>
          ))}
        </Stack>
      )}
    </Deck>
  );
}
