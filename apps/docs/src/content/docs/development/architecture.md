---
title: Architecture
description: Electron shell + shared workflows + browser-safe docs runtime
---

## Monorepo structure

```text
apps/
  desktop/   Electron shell (main/preload/renderer)
  cli/       TypeScript CLI (Commander)
  docs/      Astro/Starlight docs + browser-safe app demo
packages/
  app/                   shared React app
  application/           workflow orchestration
  application-contract/  workflow ids/types/catalog
  domain/                pure data model + validation/invariants
  host-node/             Node runtime adapters
  host-browser-mock/     browser demo/test adapters
  integrations-lms*/     LMS contracts and implementations
  integrations-git*/     Git contracts and implementations
```

## Delivery surfaces

- Desktop: renderer calls main-side workflows via `trpc-electron`.
- CLI: command handlers call in-process workflow handlers.
- Docs: browser-safe runtime mounts the same `@repo-edu/app` with mock host ports.

## Boundary rules

- Electron code stays inside `apps/desktop`.
- Shared packages must stay platform-agnostic.
- Docs runtime must remain Node/Electron free.
