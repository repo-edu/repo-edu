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

- `src/create-clone-operations.test.ts` — provider-operation live reply tests for Create and Clone
- `src/update-username-operations.test.ts` — provider-operation live reply tests for Update and
  username import
- `src/repo-create.test.ts`, `src/repo-clone.test.ts`, `src/repo-discover.test.ts` — workflow-level
  tests
- `src/fixture-adapter.ts` — bridges `@repo-edu/test-fixtures` into integration context
- `src/*-harness.ts` — provider-specific harnesses (Gitea, GitHub, GitLab)
- `src/provider-matrix.ts` — resolves active harnesses from `INTEGRATION_GIT_PROVIDERS` env

## Rules

- Each test uses `withIsolatedOrg()` — creates a fresh provider org/group and cleans up in
  `finally`.
- Selecting a provider without its required endpoint or credentials fails before tests start.
- Default provider when `INTEGRATION_GIT_PROVIDERS` is unset: `gitea`.
- Product calls use an ordinary teacher token. Gitea and GitLab admin tokens only seed and clean up.
- Gitea's `/data` tmpfs stays executable so its generated Git receive hooks can maintain the branch
  records that later API calls read.
- Workflow cases use two product fixture groups, which preserves multi-group behaviour without
  exceeding GitHub's content-creation limit during one full run.
- GitHub resources carry a per-run prefix and are removed in `finally`; the token owner must own the
  disposable test organisation.
- Provider-operation checks read the resulting files and pull requests through the harness's raw
  setup client, independently of the product adapter.
- No exports — purely executable test package.
