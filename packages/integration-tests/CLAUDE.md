# CLAUDE.md

End-to-end integration tests exercising real git provider APIs (Gitea, GitLab, GitHub).

## Running

Not part of `pnpm test` — requires explicit invocation:

```bash
# Default (Gitea via Docker)
pnpm test:integration

# Provider-specific
pnpm test:integration:gitea
pnpm test:integration:gitlab
pnpm test:integration:github
```

Docker lifecycle: `docker:up:gitea` / `docker:up:gitlab` / `docker:down`.

## Structure

- `src/repo-create.test.ts`, `src/repo-clone.test.ts` — workflow-level tests
- `src/fixture-adapter.ts` — bridges `@repo-edu/test-fixtures` into integration context
- `src/*-harness.ts` — provider-specific harnesses (Gitea, GitHub, GitLab)
- `src/provider-matrix.ts` — resolves active harnesses from `INTEGRATION_GIT_PROVIDERS` env

## Rules

- Each test uses `withIsolatedOrg()` — creates a fresh provider org/group and cleans up in `finally`.
- Unconfigured providers are `describe.skip`'d via `isConfigured` guard.
- Default provider when `INTEGRATION_GIT_PROVIDERS` is unset: `gitea`.
- No exports — purely executable test package.
