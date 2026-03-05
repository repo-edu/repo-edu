---
title: Troubleshooting
description: Common setup and runtime failures
---

## `pnpm install` fails

- Verify Node version (`node -v`) and pnpm version (`pnpm -v`).
- Use the workspace-recommended Node version (Node 24).

## Electron app does not launch

- Check `pnpm --filter @repo-edu/desktop run dev` output for preload or renderer errors.
- Verify `apps/desktop/src/preload.ts` bridge is exposing `repoEduDesktopHost`.

## CLI reports no active profile

Run:

```bash
node apps/cli/dist/index.js profile list
node apps/cli/dist/index.js profile load <profile-id>
```

## Docs demo build fails

Run:

```bash
pnpm --filter @repo-edu/docs run build
pnpm --filter @repo-edu/docs run test
```

If build fails on unresolved workspace imports, build workspace packages first with `pnpm build`.
