# CLAUDE.md

Pure TypeScript types defining the `GitProviderClient` interface for git provider operations.

## Purpose

Declares the contract for GitHub, GitLab, and Gitea adapters:

- Connection verification and username lookup
- Repository creation (batch, with template support)
- Team management and repository assignment
- Branch/PR creation and template diffs
- Namespace repository listing with leaf display names and provider identifiers
- Clone URL resolution

`CreatedRepository` carries two URLs with different consumers:

- `repositoryUrl` is the provider web page shown to users.
- `cloneUrl` is the authenticated HTTP URL used by immediate clone or push work.

`supportedGitProviders` constant: `["github", "gitlab", "gitea"]`.

## Rules

- Browser-safe: no Node/Electron imports.
- Zero implementation — types and constants only.
- `GitProviderClient` is stateless: every method takes `GitConnectionDraft` explicitly (no
  constructor-bound credentials).
- Every provider operation accepts caller cancellation through `AbortSignal`.
- `ListedRepository.name` is a leaf display name. `identifier` is the
  namespace-relative provider identity and may contain GitLab subgroup paths.
- Implementations live in `@repo-edu/integrations-git`.
