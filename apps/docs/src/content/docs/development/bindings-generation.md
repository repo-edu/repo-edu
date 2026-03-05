---
title: Workflow Contract Evolution
description: How typed workflow changes propagate across surfaces
---

This repository no longer uses generated Tauri bindings.

## Source of truth

`packages/application-contract/src/index.ts` defines:

- workflow ids
- input/output/progress types
- workflow metadata (`workflowCatalog`)

## Change flow

1. Update workflow contract types and metadata.
2. Implement or adjust handlers in `packages/application`.
3. Wire the workflow in each surface that declares support:
   - desktop router/client
   - CLI runtime
   - docs runtime (for `delivery` that includes `docs`)
4. Update tests that assert workflow coverage.

## Guardrails

- `apps/docs/src/__tests__/workflow-alignment.test.ts`
- `apps/docs/src/__tests__/browser-guardrail.test.ts`
