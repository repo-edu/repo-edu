# CLAUDE.md

Pure TypeScript types defining the `GitProviderClient` interface for git provider operations.

## Purpose

Declares the contract for GitHub, GitLab, and Gitea adapters:

- Connection verification and username lookup
- Repository creation (batch, with template support)
- Team management and repository assignment
- Branch/PR creation and template diffs
- Clone URL resolution

`supportedGitProviders` constant: `["github", "gitlab", "gitea"]`.

## Rules

- Browser-safe: no Node/Electron imports.
- Zero implementation — types and constants only.
- `GitProviderClient` is stateless: every method takes `GitConnectionDraft` explicitly (no constructor-bound credentials).
- Implementations live in `@repo-edu/integrations-git`.
