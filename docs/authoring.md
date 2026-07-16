# DiaScope v2 — Agent Authoring Guide

This is the contract for writing DiaScope v2 narrative documents (`.story.yaml` files
that narrate a `.d2` diagram). It is written for an agent that has **no other context**:
a `.d2` file, this guide, `packages/core/schema/narrative.schema.json`, and the CLI
(`node packages/cli/dist/index.js`) are all you should need.

Everything in this guide was read directly out of the source of truth
(`packages/core/src/{schema,resolve,validate,selectors,capabilities}.ts` and
`packages/react/src/{NarrativePane,PopoverLayer,TwoPaneScene}.tsx`) and, where shown,
was run through the real CLI. Where the guide says "validates clean", that means the
CLI was actually invoked and produced `0 errors, 0 warnings`.

## 1. What a narrative document is

A **D2 graph** (a `.d2` file) is the information model: nodes (with dot-notation ids for
nesting, e.g. `sys.api`, and optional `class` tags) and directed, optionally-labeled
edges between them. DiaScope never modifies the `.d2` file — it is compiled, read-only,
by the D2 WASM compiler to produce an SVG plus a machine-readable index of every node
and edge id, exactly as `graph inspect` reports it.

A **narrative document** (a `.story.yaml` file) is a *presentation* over that graph: one
or more **scenes**, each an ordered list of **steps**. Every step is a small bundle of
*intent verbs* — `show`, `focus`, `trace`, `popover`, `camera`, etc. — that describe what
the audience should see and understand at that moment, not how to animate it. Given a
document, a graph index, a scene id, and a step index, the renderer computes the full
visual state (which nodes are visible/highlighted/dimmed, which edges are traced, which
popovers are open, where the camera fits) as a **pure function** of the document and
that step index alone. There is no hidden "current state" and no delta between steps:
stepping backward recomputes the target step's state from scratch exactly like stepping
forward does, so forward and backward navigation are always consistent.

## 2. Quickstart workflow (the agent loop)

1. **Get or write a `.d2` file.** Use dot notation for nested node ids (a node `api`
   inside a container `sys` has id `sys.api`) and D2 `class:` tags for anything you want
   to select as a group later. This guide assumes you know basic D2 syntax — containers,
   labels, class tags; for the rest of the language see
   [https://d2lang.com/tour/intro](https://d2lang.com/tour/intro).
2. **Inspect it** to get the exact, case-sensitive node/edge ids you're allowed to
   reference — never guess an id from reading the `.d2` source, always confirm it here:

   ```bash
   node packages/cli/dist/index.js graph inspect packages/cli/tests/fixtures/graph.d2 --json
   ```

   Real output for that fixture:

   ```json
   {
     "nodes": [
       { "id": "sys", "label": "System", "classes": [], "parent": null, "geometry": { "x": 10, "y": 207, "width": 129, "height": 126 } },
       { "id": "sys.api", "label": "API", "classes": ["svc"], "parent": "sys", "geometry": { "x": 40, "y": 237, "width": 69, "height": 66 } },
       { "id": "request", "label": "Request", "classes": ["entry"], "parent": null, "geometry": { "x": 24, "y": 0, "width": 102, "height": 66 } }
     ],
     "edges": [
       { "id": "(request -> sys.api)[0]", "source": "request", "target": "sys.api", "label": "query" }
     ]
   }
   ```

   Every `nodes[].id` is a legal string selector. Every edge's `source`/`target` pair is
   a legal `trace` hop, written as `"source->target"`. Note that D2 container/group nodes
   are themselves addressable node ids — `sys` above is a real node you can `show`,
   `hide`, or `focus`, in addition to its child `sys.api`.

3. **Write `story.yaml` next to the `.d2` file** (see § 3 for the full field reference).
   `graph.source` is a path **relative to the `.story.yaml` file's own directory**, not
   your current working directory.

4. **Validate it:**

   ```bash
   node packages/cli/dist/index.js validate packages/cli/tests/fixtures/valid.yaml --json
   ```

   Real output for that fixture (this document is clean):

   ```json
   {
     "valid": true,
     "errors": [],
     "warnings": [],
     "graphPath": "/abs/path/to/packages/cli/tests/fixtures/graph.d2"
   }
   ```

   Real output for a broken sibling fixture (`invalid.yaml`, which references a
   misspelled node and a malformed trace):

   ```json
   {
     "valid": false,
     "errors": [
       {
         "path": "scenes[0].steps[0].focus[0]",
         "message": "Unknown node \"sys.apo\" — did you mean: sys.api?",
         "reason": "unknown-reference",
         "suggestions": ["sys.api"]
       },
       {
         "path": "scenes[0].steps[1].trace",
         "message": "Invalid trace \"request\" — a trace needs at least two node ids separated by \"->\"",
         "reason": "invalid-trace"
       }
     ],
     "warnings": [],
     "graphPath": "/abs/path/to/packages/cli/tests/fixtures/graph.d2"
   }
   ```

5. **Fix errors using the `path` and `suggestions` fields**, re-run `validate`, and
   repeat until the JSON says `"valid": true`. Then read the `warnings` array — it
   doesn't block you, but every warning reason is worth understanding (§ 6).

   `validate` also has a non-JSON mode (drop `--json`) that prints `ERROR <path>: <message>`
   / `warn <path>: <message>` lines and a final `✓ valid` or `✗ N error(s)`; prefer
   `--json` for programmatic iteration.

6. **Preview a step's computed state with `resolve`**, once the document validates, to
   check what a given `scenes[].id` + step index will actually render — visible/
   highlighted/dimmed node ids, traced edges, open popovers, and the camera fit — without
   starting the deck:

   ```bash
   node packages/cli/dist/index.js resolve packages/cli/tests/fixtures/valid.yaml --scene main --step 1
   ```

   Real output for that fixture's `main` scene, step 1 (a step with `trace:
   request->sys.api` and a popover on `sys.api`):

   ```text
   scene:       main
   step:        1
   visible:     request, sys, sys.api
   highlighted: (none)
   dimmed:      (none)
   traced:      request -> sys.api
   popovers:    sys.api: "The API service handles incoming requests."
   cameraFit:   sys, sys.api, request
   text.title:  The request path
   text.body:   (none)
   ```

   `--scene` and `--step` are both required (`--step` is the 0-based index into that
   scene's `steps` array). Add `--json` for a machine-readable `SceneState` object
   (`{visible, highlighted, dimmed, traced, popovers, cameraFit, text}`) instead of the
   labeled-lines format above — useful for scripting a check like "does step 2 actually
   highlight the node I think it does" before wiring up the deck. An unknown `--scene` id
   or an out-of-range `--step` exits 2 with a readable `fatal: ...` message (same exit-code
   convention as a malformed document, § 6), not a silent empty result.

## 3. Document format reference

The canonical machine-readable definition is
`packages/core/schema/narrative.schema.json` (JSON Schema, generated from the Zod
source — if this guide and that file ever disagree, the schema file wins). Every object
in the document is a **strict** object: unknown keys are a schema error (fatal, exit 2 —
see § 6), not silently ignored.

```yaml
version: 1                        # required, must be exactly 1 (the only version M1 speaks)

graph:
  source: ./pipeline.d2           # required. Path resolved relative to THIS yaml file's
                                   # directory, e.g. "./pipeline.d2" or "../diagrams/x.d2".

scenes:                           # required, at least 1 scene
  - id: overview                  # required, non-empty string. Should be unique — the
                                   # renderer looks scenes up by id and uses the first match.
    layout: two-pane              # optional, defaults to "two-pane" — the only layout
                                   # value M1 supports (diagram pane + narration pane).

    text:                         # optional scene-level text.
      title: "How a read reaches the database"   # FALLBACK title, used only for a step
                                                    # that doesn't set its own text.title.
      body: "<p>ignored — scene.text.body is schema-legal but nothing renders it</p>"

    annotations:                  # optional. Content shown when the audience interacts
                                   # with the diagram directly (click a node / hover an
                                   # edge), independent of which step is active.
      nodes:                      # keyed by exact node id (validated: unknown-reference
                                   # if the id doesn't exist). Rendered as RAW HTML in a
                                   # click-to-open detail drawer.
        sys.api: "<p>Single entry point. Owns the cache-then-database read logic.</p>"
      edges:                      # keyed by edge LABEL as authored in the .d2 file, OR
                                   # "source->target". NOT validated (edges aren't checked
                                   # against the graph — see § 4). Rendered as plain text
                                   # in a hover tooltip, HTML tags are NOT interpreted.
        "check cache": "Cache lookup always happens before touching the database."

    steps:                        # required, at least 1 step per scene (see § 7d).
      - id: intro                 # optional string. Give steps ids anyway: they're used
                                   # as the React list key and make diffs/logs legible.
        text:
          title: "Four services make up the read path"   # what the audience should walk
                                                            # away concluding (see § 9)
          body: "<p>A <strong>client</strong> issues a request.</p>"  # RAW HTML — keep to
                                                                        # simple tags (§ 7a)
        show: [client, request]         # M1-rendered verbs, all optional — see § 5
        hide: sys.db
        focus: [sys.api]
        highlight: { class: svc }
        dim: { not: { class: svc } }
        trace: "sys.api->cache"
        popover:
          target: cache
          content: "In-memory read-through cache."   # PLAIN TEXT, not HTML (§ 7a)
        camera:
          fit: all                      # "selection" | "all" | [selector, ...]

        # Deferred verbs below are schema-legal (so an agent using them doesn't get a
        # fatal error) but produce an "unsupported-verb" WARNING and are NOT rendered by
        # the M1 viewer. Do not use them to convey anything the audience needs to see —
        # see § 5's deferred-verb table.
        # annotate: { target: sys.api, content: "..." }
        # waitFor: click
        # compare: { left: [a], right: [b] }
        # isolate: [a, b]
        # expand: sys
        # collapse: sys
```

**Field-by-field reference** (types per the Zod schema in `packages/core/src/schema.ts`):

| Path | Type | Required | Notes |
|---|---|---|---|
| `version` | `1` | yes | Only legal value. |
| `graph.source` | non-empty string | yes | Relative to the `.story.yaml` file's directory. |
| `scenes` | array, min 1 | yes | |
| `scenes[].id` | non-empty string | yes | Should be unique per document. |
| `scenes[].layout` | `"two-pane"` | no (default `"two-pane"`) | Only value M1 supports. |
| `scenes[].text.title` / `.body` | string | no | Fallback title only (`body` unused by the renderer). |
| `scenes[].annotations.nodes` | `Record<nodeId, htmlString>` | no | Validated: keys must be real node ids. |
| `scenes[].annotations.edges` | `Record<label\|"src->tgt", text>` | no | Not validated (see § 4). |
| `scenes[].steps` | array, min 1 | yes | |
| `steps[].id` | string | no | Recommended for stable identity. |
| `steps[].text.title` / `.body` | string | no | See § 7a for HTML vs plain-text rendering. |
| `steps[].show` / `.hide` | selector or array | no | See § 5. |
| `steps[].focus` / `.highlight` / `.dim` | selector or array | no | See § 5. |
| `steps[].trace` | string or array of strings | no | `"a->b"` hop-chain syntax, § 4. |
| `steps[].popover` | `{target, content}` or array | no | § 5. |
| `steps[].camera` | `{fit: "selection" \| "all" \| selector[]}` | no | § 5. |
| `steps[].annotate/.waitFor/.compare/.isolate/.expand/.collapse` | various | no | Deferred, see § 5. |

## 4. Selector reference

A **`NodeSelector`** is one of:

- **A string**: an exact node id, dot-notation for nesting (`sys.api`), **case-sensitive**,
  and must be one of the ids `graph inspect` prints for this graph. Nothing else matches.
  D2 container/group nodes are addressable node ids in their own right (`sys` is a valid
  selector distinct from `sys.api`), and selecting a container does **not** implicitly
  select its children.
- **`{ class: "name" }`**: every node whose D2 `class:` list contains `name` (from
  `graph inspect`'s `classes` array for that node). Matches zero or more nodes.
- **`{ not: <selector> }`**: every node in the **entire graph** that the inner selector
  does *not* match — this is computed over all graph nodes, not just currently-visible
  ones (visibility filtering happens afterward, per verb, see § 5).
- **An array of selectors** (`[sel, sel, ...]`): the union of what each element matches,
  de-duplicated, first-seen order preserved. Array elements are resolved and validated
  independently, so one bad element doesn't hide errors in its siblings.

`show`, `hide`, `focus`, `highlight`, `dim`, and `camera.fit`'s array form all accept a
`NodeSelector` or an array of them.

**Trace syntax** (`trace: "a->b"` or `trace: "a->b->c"`): a `->`-separated chain of node
ids. Each **consecutive pair** must be an id of an existing node *and* an existing
directed edge in the compiled graph — `resolveTrace` looks the edge up as
`source === a && target === b` exactly as declared. **Direction matters**: if the `.d2`
file declares `a -> b`, the trace `"a->b"` resolves; `"b->a"` does not (it fails as an
`unknown-reference`, because no edge has that source/target pair — even though both node
ids individually exist).

A **multi-hop chain traces every consecutive-pair edge in it simultaneously, on that same
step** — `trace: "a->b->c"` traces both `a->b` and `b->c` at once (both edges render as
traced together), not one after the other across steps. If instead you want two (or more)
*disjoint* traces live on the same step, use the array form — a list of independent
hop-chain strings, each resolved and traced on its own:

```yaml
trace: ["x->y", "p->q"]   # two unrelated single-hop traces, both traced on this step
```

(The array form also accepts multi-hop chains as elements, e.g. `["a->b->c", "x->y"]`.)

**Edge annotations** (`scenes[].annotations.edges`) are keyed by the edge's **label**
exactly as authored in the `.d2` file (e.g. `"check cache"` for `a -> b: "check cache"`),
or by `"source->target"` — the renderer tries the label first, then falls back to
`source->target`. These keys are **not checked** by `validate` (there is no reliable way
to validate a label match ahead of render time), so a typo here fails silently instead of
producing an error — double-check spelling against `graph inspect`'s edge `label` field.

**If two different edges share the exact same label**, a label-keyed annotation is
ambiguous: the lookup is by label text, not edge identity, so hovering *either* edge shows
whichever content that shared label key resolves to first — you cannot target just one of
them this way. Prefer unique labels per edge, or key the annotation by `"source->target"`
instead (always unambiguous, since a given ordered pair identifies one edge).

## 5. Verb semantics table

All semantics below are read directly from `packages/core/src/resolve.ts`
(`foldVisibility` / `resolveStep`) — this is the *normative* definition of what each verb
does; nothing else in the system reinterprets it.

### M1-rendered verbs (8)

| Verb | Semantics |
|---|---|
| `show` | Adds node ids to the scene's **visibility fold**. The fold is cumulative across all steps `0..k` in the scene, computed fresh for every step (not delta-tracked): visibility seeds as **every node in the graph**, unless `steps[0].show` is present, in which case it seeds **empty**. Then, in step order, each step's `show` adds ids and `hide` removes them. A node not currently visible stays invisible regardless of what later verbs say about it (see `hidden-emphasis` / `hidden-popover` warnings, § 6). **Not recursive:** showing a container id does **not** show its children — list the container **and** each child you want visible. |
| `hide` | Removes node ids from the same cumulative fold. `hide` after a `show` (even in a later step) wins — order in the fold is authoritative. |
| `focus` | Resolves to the set of currently-*visible* nodes matching the selector (unresolvable/hidden matches are dropped). If `highlight` is **not** set on the same step, `highlighted` defaults to this `focus` set. **Side effect:** whenever `focus` is non-empty, every other currently-visible node (i.e. not in `focus` and not in `highlight`) is added to `dimmed` — this is the "focus dims the rest" behavior. |
| `highlight` | Resolves to the set of currently-visible nodes matching the selector; overrides the `focus`-derived default. Highlighting **on its own** (no `focus` set on that step) does **not** dim anything else — it's a pure "glow these nodes" with no side effect. Pair it with `focus` (or an explicit `dim`) if you also want the rest of the diagram to recede. |
| `dim` | An explicit selector, resolved and filtered to currently-visible nodes. **Explicit `dim` never contradicts emphasis**: any id also present in that step's resolved `focus` or `highlight` set is excluded from `dimmed`, no matter what `dim` says — focus/highlight always win. This explicit set is unioned with whatever `focus`'s auto-dim side effect (above) already added. |
| `trace` | Resolves the hop-chain(s) to a list of graph edges (§ 4), current step only — **not cumulative** like visibility; a trace from a previous step disappears unless repeated. A traced edge whose source or target node is hidden at that step will **not** be visible (the renderer hides any edge touching a hidden node) — `validate` flags this as a `hidden-trace` warning. |
| `popover` | A `{target, content}` or array of them, current step only. A popover whose `target` is **not currently visible is silently dropped** (not rendered) — `validate` flags this as a `hidden-popover` warning, but it isn't an error. |
| `camera` | Controls what the diagram viewport fits to, current step only. Three forms: absent or `{fit: "selection"}` → fits `highlighted ∪ focus` (that step's "selection"), **falling back to fitting every currently-visible node if the selection is empty**; `{fit: "all"}` → fits every currently-**visible** node (i.e. only what `show`/`hide` has left visible at this point — not necessarily the whole graph); `{fit: [selector, ...]}` → fits exactly the resolved selector list, and this explicit-array form is **not filtered by visibility** (it can target geometry of a currently-hidden node, e.g. to pre-frame where something will appear). |

Two things apply to every verb above except `show`/`hide`: they are **per-step, not
inherited** — nothing about `focus`/`highlight`/`dim`/`trace`/`popover`/`camera` carries
forward from one step to the next; each step's rendered state is recomputed purely from
that step's own fields plus the cumulative visibility fold.

### Deferred verbs (6) — validated, warned, NOT rendered in M1

`annotate`, `waitFor`, `compare`, `isolate`, `expand`, `collapse` are all accepted by the
schema (so authoring one doesn't produce a fatal error) but every use produces an
`unsupported-verb` **warning**, and the M1 renderer does nothing visible with them —
using one to convey information the audience needs is a bug in your document, not a
feature. (Don't confuse the deferred per-step `annotate: {target, content}` verb with the
always-rendered, scene-level `annotations.nodes`/`annotations.edges` maps from § 3 — the
plural, scene-level one is real in M1; the singular, per-step verb is not.)

## 6. Validation reference

`validateDocument` (via `validate --json`) returns `{ errors: Issue[], warnings: Issue[] }`
plus `valid: errors.length === 0`. Every `Issue` has `path` (exact JSON-path-style
location in the document), `message`, `reason`, and optionally `suggestions`.

**Error reasons (block validity, exit 1):**

| Reason | When |
|---|---|
| `unknown-reference` | A string node id, a trace hop, a trace edge (source/target pair), or an `annotations.nodes` key doesn't exist in the compiled graph. Message includes `— did you mean: x, y?` when a close match exists (Levenshtein-based, tolerance scales with string length). |
| `invalid-trace` | A trace string has fewer than two `->`-separated hops (e.g. `trace: "request"` alone). |

**Warning reasons (don't block, exit 0 if no errors — but review them):**

| Reason | When |
|---|---|
| `empty-selector` | A `{class: ...}` or `{not: ...}` selector matched zero nodes. (String-id selectors never produce this warning — an unknown string id is always an `unknown-reference` *error* instead, and a known one always matches exactly one node.) |
| `unsupported-verb` | A step uses one of the 6 deferred verbs (§ 5). |
| `ambiguous-edge` | A trace hop matches more than one parallel D2 edge between the same source/target pair; the **first-declared** edge is used. |
| `hidden-emphasis` | A step's `focus` or `highlight` resolves **only** to nodes that are hidden at that step (i.e. none of the matches are currently visible). |
| `hidden-popover` | A popover's `target` is not visible at that step, so it won't render. |
| `hidden-trace` | A resolved trace edge has a hidden endpoint at that step, so the traced edge won't render. Real CLI message: `trace edge "sys.api -> cache" has a hidden endpoint and will not be visible at this step`. |

**Exit codes:** `0` — valid (`errors: []`, regardless of warnings). `1` — `errors` is
non-empty (the JSON body still has the normal `{valid, errors, warnings, graphPath}`
shape). `2` — **fatal**: the document couldn't even be loaded/validated — malformed YAML,
a schema violation (unknown key, wrong type, missing required field), or a missing
`graph.source` file. Fatal output has a different, smaller shape: `{ valid: false, fatal:
"<message>" }` — there is no `errors`/`warnings` array to inspect. Two real examples:

Unknown key `zoom` on a step (schema violation, exit 2):

```json
{
  "valid": false,
  "fatal": "Invalid narrative document:\n✖ Unrecognized key: \"zoom\"\n  → at scenes[0].steps[0]"
}
```

Missing `graph.source` file (exit 2):

```json
{
  "valid": false,
  "fatal": "Graph source not found: /abs/path/nope.d2 (referenced by missing-graph.yaml as \"./nope.d2\")"
}
```

A reversed trace direction (nodes exist, edge doesn't — exit 1, an `unknown-reference`
*error*, not a warning):

```json
{
  "valid": false,
  "errors": [
    {
      "path": "scenes[0].steps[0].trace",
      "message": "Unknown edge \"cache->sys.api\"",
      "reason": "unknown-reference"
    }
  ],
  "warnings": []
}
```

## 7. Hard constraints & gotchas

**(a) HTML injection is real but narrower than it looks.** Only two fields are injected
as **raw HTML** (`dangerouslySetInnerHTML`): `steps[].text.body`, and
`scenes[].annotations.nodes[nodeId]` (the click-to-open node detail drawer). Treat both
as trusted-author input — never put a `<script>` tag or untrusted content there — and
keep the markup to simple, safe tags: `p`, `strong`, `em`, `code`, `ul`/`li`. By
contrast, `steps[].popover.content`, `scenes[].annotations.edges[key]`, and
`steps[].text.title` are all rendered as **plain, escaped text** (React text children) —
any HTML tags you put there will show up literally as text (`<p>` and all), not render.
Write those three as short plain strings.

**(b) Exactly one `NarrativeScene` per reveal.js slide.** A scene with N steps renders
`N - 1` invisible reveal.js fragment markers, indexed `0..N-2`, starting fresh from `0`.
reveal.js fragment indices are scoped to the *slide*, not the scene — putting two
`NarrativeScene`s on the same slide makes both render fragment index `0` and their
navigation collides. One scene, one slide.

**(c) Node ids are case-sensitive and must match `graph inspect` output exactly.** Don't
title-case, don't guess from the `.d2` label text — always confirm the id via
`graph inspect --json`.

**(d) A scene needs at least one step** (schema-enforced minimum). The **first step
(index 0) is what's on screen the instant the slide is entered** — no fragment, no key
press required. Every step after that is one more reveal.js fragment, i.e. one
arrow-key press to reveal.

**(e) Keep 3–7 steps per scene** for pacing — few enough to stay legible in a talk, many
enough to actually walk through something.

**(f) Trace hops are directed and exact.** `"a->b"` only matches an edge declared
`a -> b` in the `.d2` source; it will **not** match `b -> a`. See § 6 for the exact error
this produces.

## 8. Complete worked example

This pair was written for this guide and **actually validated** with
`node packages/cli/dist/index.js validate pipeline.story.yaml --json`, which returned
`{"valid": true, "errors": [], "warnings": []}` — zero errors, zero warnings.

`pipeline.d2`:

```d2
client: Client { class: entry }
request: Request { class: entry }
sys: System {
  api: API { class: svc }
  db: DB { class: svc }
}
cache: Cache { class: svc }

client -> request: "issues"
request -> sys.api: "query"
sys.api -> cache: "check cache"
sys.api -> sys.db: "read"
```

`pipeline.story.yaml`:

```yaml
version: 1
graph:
  source: ./pipeline.d2
scenes:
  - id: overview
    layout: two-pane
    text:
      title: "How a read reaches the database"
    annotations:
      nodes:
        client: "<p>External caller. Never talks to the database directly.</p>"
        sys.api: "<p>Single entry point. Owns the cache-then-database read logic.</p>"
      edges:
        "query": "The only request shape this pipeline accepts."
    steps:
      - id: intro
        text:
          title: "Four services make up the read path"
          body: "<p>A <strong>client</strong> issues a request that eventually reaches the database.</p>"
        camera:
          fit: all
      - id: entry-point
        text:
          title: "Every read starts with the client and its request"
        focus: [client, request]
        popover:
          target: client
          content: "External caller — never talks to the database directly."
      - id: api-owns-the-logic
        text:
          title: "The API decides whether to hit the cache or the database"
        highlight: { class: svc }
        dim: [request]
      - id: wrap-up
        text:
          title: "Client, request, and the API/DB/cache trio complete the picture"
        focus: [sys.db]
        camera:
          fit: all

  - id: request-flow
    layout: two-pane
    text:
      title: "Tracing one read end to end"
    annotations:
      edges:
        "check cache": "Cache lookup always happens before touching the database."
    steps:
      - id: narrow-in
        text:
          title: "Zoom into client, request, and the API"
        show: [client, request, sys.api]
        camera:
          fit: all
      - id: cache-check
        text:
          title: "The API checks the cache first"
        show: [cache]
        focus: [sys.api, cache]
        trace: "sys.api->cache"
        popover:
          target: cache
          content: "In-memory read-through cache — a hit skips the database."
      - id: db-read
        text:
          title: "On a miss, the API reads the database directly"
        show: [sys.db]
        hide: [cache]
        focus: [sys.api, sys.db]
        trace: "sys.api->sys.db"
        popover:
          target: sys.db
          content: "Reached only on a cache miss."
```

Genuine `validate --json` output for this exact pair:

```json
{
  "valid": true,
  "errors": [],
  "warnings": [],
  "graphPath": "/abs/path/to/pipeline.d2"
}
```

A few things this example demonstrates end-to-end: `overview` never `show`s or `hide`s
anything, so all 6 nodes stay visible for the whole scene (visibility seeds as
everything). `request-flow`'s first step **does** set `show`, so its fold seeds empty and
only 3 nodes start visible — `cache` and `sys.db` are added, and `cache` is later
`hide`-en again, in later steps. `api-owns-the-logic` shows `highlight` used *without*
`focus`: it selects all 3 `svc`-classed nodes and adds a glow, and the separate `dim:
[request]` only dims that one node — nothing else fades, because there's no `focus` on
that step to trigger the "dim everything else" side effect (§ 5).

## 9. Authoring quality guidance

- **One idea per step.** If a step's title needs "and", it's probably two steps.
- **`text.title` is the conclusion, not a caption.** Write what the audience should
  walk away believing ("The API decides whether to hit the cache or the database"), not
  what's on screen ("The API node is highlighted").
- **Camera follows the narration.** If a step's text is about two specific nodes,
  `focus` (or an explicit `camera.fit` array) should say so — don't leave the camera
  fit to `all` while narrating something specific.
- **Use `dim`/`focus` to remove distraction**, not to decorate. If a step doesn't need
  the audience's attention narrowed, leave emphasis verbs out entirely.
- **Reserve `trace` for causality/data-flow moments** — the instant you're saying "and
  then this calls that" — not for every step that happens to involve an edge.
- **`popover` is for ONE key fact**, in plain text (§ 7a) — it renders in a ~260px card
  next to the node, not a paragraph. If you need more than a sentence, put it in
  `annotations.nodes` instead (raw HTML, opened deliberately by a click) rather than a
  popover the audience didn't ask to read.
