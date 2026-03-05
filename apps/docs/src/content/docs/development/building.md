---
title: Building
description: Build, typecheck, and validate workspace targets
---

## Install

```bash
pnpm install
```

## Build all

```bash
pnpm build
```

## Validate all

```bash
pnpm validate
```

## Per-app commands

| Target | Command |
| --- | --- |
| Desktop build | `pnpm --filter @repo-edu/desktop run build` |
| Desktop dev | `pnpm --filter @repo-edu/desktop run dev` |
| CLI build | `pnpm --filter @repo-edu/cli run build` |
| Docs dev | `pnpm --filter @repo-edu/docs run dev` |
| Docs build | `pnpm --filter @repo-edu/docs run build` |
| Docs tests | `pnpm --filter @repo-edu/docs run test` |

## Desktop-specific validation

```bash
pnpm desktop:validate
```
