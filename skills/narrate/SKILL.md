---
name: narrate
description: "Use when the user wants to turn code, a system, or any logic into a narrated interactive diagram story. Triggers on: 'narrate this', 'explain this flow', 'document this system', 'help me explain X to others', 'create a diagram story for', or when pointing at a folder and asking to visualize/explain it."
---

# Narrate Code as an Interactive Story with DiaScope

You have access to `diascope` — a CLI that turns a D2 diagram + a YAML narration sidecar into an interactive, step-by-step HTML story. The audience opens one `.html` file and walks through the explanation using keyboard arrows or buttons.

**Announce at start:** "I'm using the narrate skill to create a DiaScope story."

## Prerequisite check

Before starting, verify diascope is available:

```bash
diascope --version 2>/dev/null || echo "NOT INSTALLED"
```

If not installed:
```bash
npm install -g diascope
```

---

## The Workflow

### Step 1: Understand the target

Read the code, docs, or files the user pointed at. You are looking for:

- **Nodes** — key components, services, functions, actors, or data stores (5–12 is ideal)
- **Flows** — the sequences that matter; what triggers what, what transforms what
- **Audience** — who will watch this story? (developer, stakeholder, newcomer?)

If the scope is ambiguous, ask ONE focused question:
> "Which specific flow or aspect do you most want to explain — the happy path, error handling, or the full lifecycle?"

Do not ask multiple questions at once.

---

### Step 2: Write the D2 diagram

Create `<name>.d2`. Keep it focused — a story is not an architecture diagram of everything. Capture the entities that appear in the narrative.

**Use `# @step <id>` annotations** above the connections or nodes that mark each narrative beat. These are invisible to the D2 renderer but let `diascope init` scaffold the story automatically.

```d2
# @step step-01
Client -> Server: POST /api/data

# @step step-02
Server -> Auth: validate token

# @step step-03
Server -> Database: SELECT user WHERE id = ?

# @step step-04
Database -> Server: user row
Server -> Client: 200 OK
```

**D2 guidelines:**
- Node names must be stable identifiers (no spaces unless quoted: `"My Service"`)
- Nested nodes group related things: `System { Client; Server }`
- Edge labels become the text shown on arrows — keep them short
- D2 renders top-to-bottom by default; use `direction: right` for flow diagrams

---

### Step 3: Scaffold the narration sidecar

```bash
diascope init <name>.d2
# → writes <name>.story.yaml with @step annotations pre-populated
```

If no `@step` annotations exist, it writes a placeholder stub. Review the output.

---

### Step 4: Write the narration

Edit `<name>.story.yaml`. For each step:

- **`title`**: a concrete, action-oriented headline — not "Step 1" but "Client authenticates with Bearer token"
- **`body`**: explain the WHY, not just the what. What decision was made here? What could go wrong? What's the contract?
- **`nodes`**: must match D2 node names exactly (case-sensitive, dot-notation for nested: `System.Client`)

```yaml
steps:
  - id: step-01
    tag: "01"
    title: "Client sends authenticated request"
    body: |
      The client attaches a short-lived JWT in the Authorization header.
      Tokens expire after 15 minutes — the client must refresh before expiry
      or the request will be rejected at step 2.
    nodes:
      - Client
      - Server
```

**Narration guidelines:**
- Each step should be self-contained — a reader who skips to step 3 should still understand it
- Prefer 3–6 sentences per step body
- Use `detail_panels` for deep-dive content that not everyone needs (click-to-expand)
- Use `edge_tooltips` for protocol/contract details on specific arrows

---

### Step 5: Build the story

```bash
diascope build <name>.d2 <name>.story.yaml -o <name>.html
```

This runs `d2` to render the SVG, embeds it with the narration config, and writes a self-contained HTML file. Open it in a browser — no server needed.

If diascope warns about missing node IDs, the `nodes:` values in the YAML don't match the D2 source. Fix the spelling/casing to match exactly.

---

### Step 6: Iterate with the user

Show the user the output path and ask:
> "Here's the story at `<name>.html`. Does this capture what you wanted? Any steps to reorder, merge, or expand?"

Make targeted edits to the `.story.yaml` (rarely the `.d2` unless the diagram itself is wrong) and rebuild.

---

## File naming conventions

| Artifact | Convention |
|----------|-----------|
| D2 source | `<topic>.d2` (e.g. `auth-flow.d2`) |
| Narration | `<topic>.story.yaml` |
| Output | `<topic>.html` |

Place all three next to each other in the same directory. The `.d2` and `.story.yaml` should be committed to the repo; the `.html` can be committed or treated as a build artifact.

---

## LLM patching guide (for future edits)

When updating an existing `.story.yaml`:
- Append to `steps[]` with a new unique `id` to add steps
- Edit `title` or `body` to refine narration
- `nodes` values must match D2 source names exactly — never invent them
- Preserve existing `id` values (they match `# @step` comments in the `.d2`)
- Run `diascope build` after any change to validate and regenerate the HTML
