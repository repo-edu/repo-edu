---
title: Quick Start
description: Verify desktop, CLI, and docs surfaces in one pass
---

## 1. Build core packages

```bash
pnpm build
```

## 2. Run Electron desktop

```bash
pnpm dev
```

Expected behavior:

- A desktop window opens.
- The renderer mounts `@repo-edu/app`.
- Main/preload/renderer communication uses `trpc-electron`.

## 3. Run CLI smoke commands

```bash
pnpm cli:build
node apps/cli/dist/index.js course list
node apps/cli/dist/index.js roster show --assignments
```

## 4. Run docs demo and tests

```bash
pnpm --filter @repo-edu/docs run build
pnpm --filter @repo-edu/docs run test
```

## 5. Check desktop boundary validation

```bash
pnpm desktop:validate
```

This verifies shell-boundary constraints and the desktop tRPC spike path.
