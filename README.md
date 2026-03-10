# d2-story-viewer

Turn [D2](https://d2lang.com) diagrams into narrated, interactive step-by-step stories — as a CLI that produces self-contained static HTML, or as a JS library you can embed in any page.

## Requirements

- Node.js 18+
- [`d2`](https://d2lang.com/tour/install) on your PATH (for the CLI)

## Quick start

```bash
npm install -g d2-story-viewer
```

**1. Add `# @step` annotations to your D2 file** *(optional but recommended)*

```d2
# @step step-01
Client -> Server: POST /api/data

# @step step-02
Server -> Database: SELECT ...
```

**2. Scaffold the narration sidecar**

```bash
d2story init my-diagram.d2
# → writes my-diagram.story.yaml
```

**3. Edit the sidecar** — fill in titles, body text, any detail panels.

**4. Build the interactive HTML**

```bash
d2story build my-diagram.d2 my-diagram.story.yaml -o story.html
# → writes story.html (open in browser, no server needed)
```

---

## Story format

Narration lives in a `.story.yaml` file alongside the `.d2` source. The D2 file is **never modified** by the tooling.

```yaml
# my-diagram.story.yaml
meta:
  title: "Request Flow"
  d2_source: my-diagram.d2

steps:
  - id: step-01
    tag: "01"
    title: "Client sends request"
    body: |
      The client initiates an HTTP POST to /api/data.
      Authentication is handled at this boundary.
    nodes:
      - Client    # must match D2 node names exactly
      - Server

  - id: step-02
    tag: "02"
    title: "Server queries database"
    nodes:
      - Server
      - Database

detail_panels:
  Server: |
    <p>Handles auth and routing.</p>
    <ul><li>Rate limited: 1000 req/s</li></ul>

edge_tooltips:
  "POST /api/data": "Authenticated with Bearer token"
```

Full format reference: [docs/story-format.md](docs/story-format.md)

---

## Linking story steps to D2 nodes

`nodes` values in each step must match D2 node names **exactly** (case-sensitive):

| D2 source          | `nodes` value      |
|--------------------|--------------------|
| `Client`           | `Client`           |
| `System.Client`    | `System.Client`    |
| `"My Service"`     | `My Service`       |

The `d2story build` command warns you if any referenced node ID isn't found in the rendered SVG.

### Optional: D2 comment hooks

`# @step <id>` comments placed above nodes or edges in the `.d2` file are invisible to the D2 renderer. `d2story init` reads them to pre-populate the sidecar:

```d2
# @step step-01
Client -> Server: sends to    ← nodes [Client, Server] extracted automatically
```

The `id` in the comment must match the `id` in the corresponding sidecar step.

---

## CLI reference

```
d2story build <diagram.d2> <story.yaml> [options]

  -o, --out <file>          Output HTML file (default: <story>.html)
  --viewer-bundle <path>    Path or URL to viewer JS bundle

d2story init <diagram.d2> [options]

  -o, --out <file>          Output story file (default: <diagram>.story.yaml)
```

---

## JS library usage

If you're embedding in a framework or building a custom shell:

```js
import { D2StoryViewer } from "d2-story-viewer";
import { parseStoryFile, storyToViewerOptions } from "d2-story-viewer/story";

const story = parseStoryFile(yamlString);
const viewer = new D2StoryViewer({
  ...storyToViewerOptions(story),
  autoBindControls: true,
});
viewer.init();
```

The viewer expects:
- An SVG inside `#svg-host`
- Buttons with class `.step-btn` and `data-step="N"` attributes
- Optional elements: `#btn-prev`, `#btn-next`, `#btn-focus`, `#btn-fit`, `#step-tag`, `#step-title`, `#step-body`, `#detail-drawer`, `#edge-tooltip`
- [`svg-pan-zoom`](https://github.com/bumbu/svg-pan-zoom) on `window.svgPanZoom` (or pass via `options.svgPanZoom`)

See [templates/story.html](templates/story.html) for a complete working shell.

---

## LLM patching guide

When asking an LLM to update a `.story.yaml`:
- Add steps by appending to `steps[]` with a new unique `id`
- Node IDs come from the `.d2` file — never invent them
- `body` supports inline HTML; use `|` block scalar for multi-line
- Preserve existing `id` values — they may match `# @step` comments in the D2 source
- Run `d2story build` after changes to validate node IDs against the rendered SVG
