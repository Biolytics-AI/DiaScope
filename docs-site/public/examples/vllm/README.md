# vLLM Deployment Example

This example demonstrates how DiaScope can narrate a compliance-heavy deployment diagram for a vLLM inference stack.

## Files

- `deployment.d2`: source diagram
- `deployment.story.yaml`: walkthrough sidecar used by DiaScope

## Build locally

From the repository root:

```bash
npm install
npm run build
node dist/cli/index.js build examples/vLLM/deployment.d2 examples/vLLM/deployment.story.yaml -o examples/vLLM/deployment.html
```

You can also publish the generated HTML into `docs-site/public/examples/vllm/` so the docs site can link to it directly.
