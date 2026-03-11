# DiaScope Agent Instructions

## Interactive / Visual Audit

When working on DiaScope itself, agents must treat browser-visible output as a
first-class surface to verify, not as something that can be inferred from code
alone.

### When this is required

Run an interactive / visual audit whenever a change can affect:

- generated HTML output
- viewer bootstrapping
- step navigation
- focus or highlight behavior
- zoom / pan behavior
- click or hover interactions
- detail drawers or tooltips
- layout, sizing, overflow, or viewport behavior
- any other browser-visible state

### What an interactive / visual audit entails

Agents must use a browser and inspect the real output directly.

This means:

- opening the generated page or docs route in a browser, not just reading the file
- using browser devtools or equivalent browser tooling
- checking the JavaScript console for runtime errors and warnings
- checking network requests for failed assets, bad URLs, blocked resources, or incorrect MIME / load behavior
- inspecting the DOM to understand which elements are present, which are interactive, and which selectors or attributes correspond to visible controls
- understanding what is actually clickable, hoverable, focusable, scrollable, or keyboard-driven
- identifying where the relevant elements are on the page before attempting interactions

### Minimum interaction checks

Agents should verify the behavior that a user would actually rely on.

This usually includes:

- initial load state
- whether the first step renders correctly
- whether the expected controls exist
- step button navigation
- previous / next controls
- keyboard navigation if supported
- focus mode or context mode toggles
- fit / zoom / pan behavior if present
- clicking nodes, edges, or hotspots
- hover behavior and tooltips
- drawers, overlays, or side panels
- whether visual state changes match the narration or selected step

If the page is supposed to be interactive, a static render is not enough. Agents
must confirm the interaction model actually works.

### What to look for

Agents should actively look for:

- controls that render but do nothing
- missing or stale text in the narration panel
- DOM elements that exist but are never wired up
- event handlers that fail silently
- browser-console errors
- asset-path or CDN issues
- race conditions during bootstrap
- layout breakage, clipping, overflow, or hidden content
- mismatches between highlighted elements and narrated elements
- interactions that only work partially
- differences between local output and docs-served output

### Reporting findings

When issues are found, agents should report them concretely with:

- exact reproduction steps
- what was expected
- what happened instead
- browser evidence such as console errors, network failures, DOM state, or visible UI behavior
- whether the issue is blocking or non-blocking

Agents should prefer evidence over assumption. "The code looks right" is not a
valid substitute for browser verification.

### Audit improvement loop

Agents should reflect on the audit process itself while doing this work.

If the audit required avoidable trial and error, missing repo guidance, or ad hoc
debugging steps, agents should not just work around it and forget it. They
should surface that with the user and propose improvements to this `AGENTS.MD`
file so future agents can audit faster and more reliably.

The goal is cumulative improvement:

- if a browser-audit step was essential, capture it
- if a recurring failure mode was discovered, capture it
- if a useful checklist emerged, capture it
- if a better local serving or inspection workflow was needed, capture it

Agents should treat `AGENTS.MD` as a living development guide for DiaScope
itself, not a static file. The audit process should get better over time instead
of being reinvented each session.

## GitHub Issue Logging And Focus Management

When developing DiaScope, agents must keep the active task bounded. If the user
flags additional issues during development, agents should distinguish between
blocking issues that must be fixed now and non-blocking issues that should be
captured in GitHub and deferred.

### Git write authority

Agents must not run `git commit` or `git push` unless the user explicitly asks
for it in the current turn.

That restriction does not prevent disciplined GitHub issue logging when the user
has made it clear that non-blocking issues should be captured rather than fixed
immediately.

### Blocking vs non-blocking issues

A blocking issue is one that prevents the current task from being:

- built
- rendered
- interacted with
- understood
- or validated

A non-blocking issue is still real and worth tracking, but does not prevent the
current task from moving forward.

Default behavior:

- fix blocking issues in the current task flow
- log non-blocking issues to GitHub when appropriate
- return to the active task after logging

Agents should not let side discoveries turn into unrelated implementation work
unless the user explicitly redirects the session.

### What to include in GitHub issues

When creating an issue for something discovered during development, include:

- a concise problem statement
- exact reproduction steps
- expected behavior
- actual behavior
- evidence from the browser audit when relevant
- whether the issue is blocking or backlog

Useful evidence may include:

- browser console errors
- failed network requests
- DOM state observations
- screenshots or visible UI behavior
- notes about which controls were clicked, hovered, or tested

### Relevant GitHub skills

Agents should use the repo's GitHub workflow skills when applicable instead of
inventing inconsistent ad hoc behavior.

Relevant skills include:

- `gh-workflow-sync` for issue / PR lifecycle sync and checkpoints
- `gh-address-comments` for handling review comments
- `gh-fix-ci` for GitHub Actions failures

If one of these skills clearly matches the task, use it.

### Focus rule during development

Issue logging must support focus, not destroy it.

When several issues are discovered in one session:

- capture each issue cleanly
- keep the issue description evidence-based
- avoid switching into implementation for logged issues
- resume the main task after logging

If the user is actively steering the current feature, bugfix, or audit, the
agent should preserve momentum on that work unless a discovered issue is truly
blocking.

### Workflow improvement loop

Agents should also reflect on the GitHub issue-logging workflow itself.

If repeated patterns emerge, such as:

- missing issue templates
- unclear blocking vs non-blocking decisions
- inconsistent checkpoint behavior
- friction around when to file issues versus fix immediately

then agents should raise that with the user and propose updates to this
`AGENTS.MD` file so the development workflow becomes more reusable over time.
