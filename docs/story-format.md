# Story Format Reference

A `.story.yaml` file narrates a D2 diagram. It lives next to the `.d2` file
and is the single source of truth for step content. The `.d2` file is never
modified by the viewer.

## Minimal example

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
      - Client
      - Server

  - id: step-02
    tag: "02"
    title: "Server queries database"
    nodes:
      - Server
      - Database
```

## Linking to D2 nodes

`nodes` values must match D2 node names exactly (case-sensitive).

| D2 source        | `nodes` value    |
|------------------|------------------|
| `Client`         | `Client`         |
| `System.Client`  | `System.Client`  |
| `"My Service"`   | `My Service`     |

## Optional: D2 comment annotations

You can annotate your `.d2` file with `# @step <id>` comments.
These are ignored by the D2 renderer — they only help `diascope init`
scaffold the sidecar automatically.

```d2
# @step step-01
Client -> Server: POST /api/data

# @step step-02
Server -> Database: SELECT ...
```

Running `diascope init my-diagram.d2` will produce a starter `my-diagram.story.yaml`
with the annotated steps pre-populated.

## Detail panels

Click-to-expand node details. Keys are D2 node IDs; values are HTML.

```yaml
detail_panels:
  Server: |
    <p>Handles authentication and request routing.</p>
    <ul><li>Rate limited: 1000 req/s</li></ul>
```

## Edge tooltips

Hover tooltips on edges. Keys are the edge label text from D2.

```yaml
edge_tooltips:
  "POST /api/data": "Authenticated with Bearer token"
```

## LLM patching guide

When an LLM modifies this file:
- Add steps by appending to `steps[]` with a new unique `id`
- Node IDs come from the `.d2` file — never invent them
- `body` supports inline HTML; use `|` block scalar for multi-line
- Preserve existing `id` values — they may be referenced by `# @step` annotations
- Run `diascope build` after changes to verify node IDs are valid
