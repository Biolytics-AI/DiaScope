# External GPU Processing Compliance Blueprint

This example shows how DiaScope can present a compliance-first walkthrough for AI
processing that takes clinical context outside HealthcareProvider's current hosting
environment.

The intended audience is not primarily engineers. It is aimed at healthcare
buyers, legal reviewers, compliance stakeholders, and information security teams
who need a shared blueprint for what a compliant external GPU setup should look
like.

## Scenario

- HealthcareProvider is the EHR controller serving healthcare institutions.
- Biolytics AI provides the external AI processing layer and related safeguards.
- A third-party GPU host provides the underlying infrastructure or managed
  inference capability.

The story uses the rented-GPU / self-managed pattern as the reference blueprint.
That model makes the required controls explicit: authorization at the outbound
boundary, authenticated transport, restricted ingress, controlled operations
access, residency guarantees, provider evidence, and PHI-safe audit handling.

Managed inference remains relevant, but in that model more assurance must come
from the provider's contractual terms, statelessness guarantees, audit scope, and
certifications.

## Files

- `deployment.d2`: the canonical blueprint diagram
- `deployment.story.yaml`: the narrated walkthrough
- `deployment.html`: generated output artifact

## Build locally

From the repository root:

```bash
npm run build
node dist/cli/index.js build examples/vLLM/deployment.d2 examples/vLLM/deployment.story.yaml -o examples/vLLM/deployment.html
```

## Docs site sync

The docs site serves copies of these assets from `docs-site/public/examples/vllm/`.
`examples/vLLM/` is the canonical source; the docs-site copies should be updated
from it after rebuilding the example.
