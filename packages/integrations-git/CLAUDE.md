# CLAUDE.md

This package contains Git provider adapters (`@repo-edu/integrations-git`).

## Responsibility

Implement provider clients behind `GitProviderClient` from
`@repo-edu/integrations-git-contract`.

- `src/index.ts`: provider dispatch (`createGitProviderClient`)
- `src/github/*`: GitHub adapter (`@octokit/rest`)
- `src/gitlab/*`: GitLab adapter (`@gitbeaker/rest`)
- `src/gitea/*`: Gitea adapter over `HttpPort`

## Rules

- Keep provider API details isolated inside this package.
- Keep outputs in contract/domain shapes only.
- Keep orchestration/business rules out of adapters.
- Use injected runtime/HTTP seams (`HttpPort`) where applicable.

## Adding Git Capabilities

1. Extend interfaces/types in `@repo-edu/integrations-git-contract`.
2. Implement GitHub, GitLab, and Gitea behavior (or document intentional provider gaps).
3. Add adapter tests per provider.
