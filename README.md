# DiaScope

[![Package CI](https://github.com/Biolytics-AI/DiaScope/actions/workflows/ci.yml/badge.svg)](https://github.com/Biolytics-AI/DiaScope/actions/workflows/ci.yml)
[![Docs](https://github.com/Biolytics-AI/DiaScope/actions/workflows/docs.yml/badge.svg)](https://github.com/Biolytics-AI/DiaScope/actions/workflows/docs.yml)
[![npm version](https://img.shields.io/npm/v/%40biolytics-ai%2Fdiascope)](https://www.npmjs.com/package/@biolytics-ai/diascope)
[![Docs Site](https://img.shields.io/badge/docs-diascope.biolytics.ai-06E1EC)](https://diascope.biolytics.ai)
[![Node](https://img.shields.io/badge/node-%3E%3D22-002451)](https://nodejs.org/)

Turn any codebase, system, or flow into a narrated interactive diagram story — a self-contained `.html` file your audience can step through with arrow keys.

You author a [D2](https://d2lang.com) diagram and a YAML narration sidecar. DiaScope renders the diagram, wires up the step-by-step navigation, and writes one file you can open in a browser or share anywhere.

Docs: `https://diascope.biolytics.ai`

**Or:** install the `narrate` skill and let an agent do it for you.

---

## How it looks

Each story is a full-screen page: diagram on the left, narration panel on the right. Each step highlights the relevant nodes, pans/zooms to them, and shows the title + body text. Click a node for detail. Press `→` to advance.

## Interactive features

- Step-by-step narration with active node highlighting
- Automatic pan and zoom to the current step
- `Focus` mode to isolate active nodes and edges
- `Fit` plus manual zoom controls
- Keyboard navigation with arrow keys
- Clickable node detail panels
- Edge hover tooltips

See the live example and feature docs at `https://diascope.biolytics.ai`.

---

## Requirements

* Node.js 18+
* [`d2`](https://d2lang.com/tour/install) on your PATH

---

## Install

```bash
npm install -g @biolytics-ai/diascope
```

---

## Human-driven workflow

**1. Write your D2 diagram** — and optionally annotate it with `# @step` markers:

```d2
# @step step-01
Client -> Server: POST /api/data

# @step step-02
Server -> Database: SELECT ...

# @step step-03
Database -> Server: result row
Server -> Client: 200 OK
```

`# @step` comments are invisible to the D2 renderer. They tell `diascope init` which nodes belong to which narrative beat.

**2. Scaffold the narration:**

```bash
diascope init auth-flow.d2
# → writes auth-flow.story.yaml
```

**3. Fill in the narration** — edit `auth-flow.story.yaml`:

```yaml
meta:
  title: "Auth Flow"
  d2_source: auth-flow.d2

steps:
  - id: step-01
    tag: "01"
    title: "Client sends authenticated request"
    body: |
      The client attaches a short-lived JWT in the Authorization header.
      Tokens expire after 15 minutes — refresh before expiry or the
      request is rejected at the next step.
    nodes:
      - Client
      - Server

  - id: step-02
    tag: "02"
    title: "Server queries the database"
    nodes:
      - Server
      - Database
```

**4. Build:**

```bash
diascope build auth-flow.d2 auth-flow.story.yaml -o auth-flow.html
open auth-flow.html
```

---

## Agent-driven workflow

Install the `narrate` skill into your coding agent. Then just point it at code:

> "Narrate the payment flow in `src/payments/`"
> "Create a diagram story explaining how the sync engine works"
> "Help me explain the request lifecycle to a new developer"

The agent reads your code, writes the D2 diagram and `.story.yaml`, runs `diascope build`, and hands you the `.html`.

### Install for Claude Code

```bash
git clone https://github.com/Biolytics-AI/DiaScope.git ~/.claude/diascope
mkdir -p ~/.agents/skills
ln -s ~/.claude/diascope/skills ~/.agents/skills/diascope
```

Restart Claude Code. Full instructions: [.claude/INSTALL.md](.claude/INSTALL.md)

### Install for Codex

Tell Codex:

```text
Fetch and follow instructions from https://raw.githubusercontent.com/Biolytics-AI/DiaScope/main/.codex/INSTALL.md
```

Full instructions: [.codex/INSTALL.md](.codex/INSTALL.md)

---

## Story format reference

The `.story.yaml` file is the source of truth for all narration. The `.d2` file is **never modified** by DiaScope tooling.

Full reference: [docs/story-format.md](docs/story-format.md)

### Linking steps to nodes

`nodes:` values must match D2 node names **exactly** (case-sensitive):

| D2 source       | `nodes:` value  |
|-----------------|-----------------|
| `Client`        | `Client`        |
| `System.Client` | `System.Client` |
| `"My Service"`  | `My Service`    |

`diascope build` warns you if any referenced node ID isn't found in the rendered SVG.

### Detail panels and edge tooltips

```yaml
detail_panels:
  Server: |
    <p>Handles auth and routing. Rate limited: 1000 req/s.</p>

edge_tooltips:
  "POST /api/data": "Authenticated with Bearer token"
```

---

## CLI reference

```text
diascope build <diagram.d2> <story.yaml> [options]

  -o, --out <file>          Output HTML (default: <story>.html)
  --viewer-bundle <path>    Custom path/URL for viewer JS bundle

diascope init <diagram.d2> [options]

  -o, --out <file>          Output story file (default: <diagram>.story.yaml)
```

---

## Examples

Working examples live in [`examples/`](examples/). The current vLLM example includes:

- `examples/vLLM/deployment.d2`
- `examples/vLLM/deployment.story.yaml`
- `examples/vLLM/README.md`

You can also browse the same example in the docs at `https://diascope.biolytics.ai/examples/vllm-deployment/`.

---

## JS library

Embed in a framework or custom shell:

```js
import { DiaScopeViewer } from "@biolytics-ai/diascope";
import { parseStoryFile, storyToViewerOptions } from "@biolytics-ai/diascope/story";

const story = parseStoryFile(yamlString);
const viewer = new DiaScopeViewer({
  ...storyToViewerOptions(story),
  autoBindControls: true,
});
viewer.init();
```

The viewer expects `svg-pan-zoom` on `window.svgPanZoom` (or via `options.svgPanZoom`). See [templates/story.html](templates/story.html) for a complete working shell.

---

## Release process

DiaScope releases are published from GitHub, not from local machines.

1. Open a PR into `main`.
2. Merge only after `build-and-test` and `build-docs` pass.
3. Create and push a version tag like `v0.1.0`.
4. GitHub Actions publishes `@biolytics-ai/diascope` to npm and creates the matching GitHub Release.

Local `npm publish` should only be used for dry-runs and debugging.

---

## LLM patching guide

When asking an LLM to update a `.story.yaml`:

* Add steps by appending to `steps[]` with a new unique `id`
* Node IDs come from the `.d2` file — never invent them
* `body` supports inline HTML; use `|` block scalar for multi-line
* Preserve existing `id` values — they match `# @step` annotations in the `.d2`
* Run `diascope build` after edits to validate and regenerate
