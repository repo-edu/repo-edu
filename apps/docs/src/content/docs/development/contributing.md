---
title: Contributing
description: Contribution workflow for shared contracts and surfaces
---

## Before opening a change

1. Keep behavior in shared packages where possible.
2. Keep shell-specific concerns in app shells (`desktop`, `cli`, `docs`).
3. Preserve workflow type exhaustiveness.

## Minimum validation

```bash
pnpm check
pnpm test
pnpm desktop:validate
pnpm --filter @repo-edu/docs run test
```

## High-risk areas

- Workflow contract changes
- Persistence schema changes
- Cross-surface behavior mismatches
- Electron boundary leakage into shared packages
