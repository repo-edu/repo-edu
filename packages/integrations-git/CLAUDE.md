# CLAUDE.md

This package contains Git provider adapters (`@repo-edu/integrations-git`).

## Responsibility

Implement provider clients behind `GitProviderClient` from
`@repo-edu/integrations-git-contract`.

- `src/index.ts`: eager, stateless provider dispatch
- `src/invocation-guard.ts`: caller-cancellation boundary for every operation
- `src/{github,gitlab,gitea}/*`: provider facade, six capability owners and
  provider-local infrastructure

Each provider facade composes the same capability files: `identity.ts`,
`repositories.ts`, `teams.ts`, `template-changes.ts`, `branch-review.ts` and
`discovery.ts`. Facades compose and guard operations; capability files own
provider semantics.

## Rules

- Keep provider API details isolated inside this package.
- Keep outputs in contract/domain shapes only.
- Keep orchestration/business rules out of adapters.
- Use injected runtime/HTTP seams (`HttpPort`) where applicable.
- Keep provider clients and root dispatch free of cross-call state.
- Return authenticated clone URLs from repository creation rather than relying
  on a later visibility-sensitive lookup.
- Route every public provider operation through the shared invocation guard.

## Adding Git Capabilities

1. Extend interfaces/types in `@repo-edu/integrations-git-contract`.
2. Assign the operation to one capability owner in each provider.
3. Implement GitHub, GitLab, and Gitea behavior (or document intentional
   provider gaps).
4. Add behavior tests to the matching provider capability suite.
