# CLAUDE.md

This package contains Git provider adapters (`@repo-edu/integrations-git`).

## Responsibility

Implement provider clients behind `GitProviderClient` from
`@repo-edu/integrations-git-contract`.

- `src/index.ts`: eager, stateless provider dispatch
- `src/invocation-guard.ts`: caller-cancellation boundary for every operation
  and the read and write rule for every provider request
- `src/team-name.ts`: the one team name rule every provider uses
- `src/{github,gitlab,gitea}/*`: provider facade, five capability owners and
  provider-local infrastructure

Each provider facade composes the same capability files: `identity.ts`,
`repositories.ts`, `teams.ts`, `branch-review.ts` and `discovery.ts`. Facades
compose and guard operations; capability files own provider semantics.

A team's name on the server is built from its group's name and the group's
stable ID. Group names are unique only inside one group set, so a name alone
would let two groups share one team and push to each other's repositories. The
name keeps to lowercase letters, digits, `-` and `_`, because Gitea team names
and GitLab group paths refuse most other characters. Every provider sends that
name and reuses an existing team only when it carries that name.

GitLab namespace and project resolution live in provider-local infrastructure,
not in the teams or repositories capability. All capabilities share those
absence rules.

## Rules

- Keep provider API details isolated inside this package.
- Keep outputs in contract/domain shapes only.
- Keep orchestration/business rules out of adapters.
- Use injected runtime/HTTP seams (`HttpPort`) where applicable.
- Keep provider clients and root dispatch free of cross-call state.
- Return authenticated clone URLs from repository creation rather than relying
  on a later visibility-sensitive lookup.
- Route every public provider operation through the shared invocation guard.
- Send every provider request through `sendGitRequest`. A read keeps the
  caller's signal and reports its own stop or failure. A write never receives
  the signal, so it runs to its response; a write that loses its response stays
  unknown.
- Every transport throws `GitReplyError` for a reply outside 2xx: Gitea and
  GitLab through `sendGitHttpRequest`, GitHub by converting Octokit's error in
  its request hook. A capability catches a reply error only for the statuses
  or provider wording it names as an answer, through `isGitReply` or a
  provider's message predicate. Never read a status or a reply body by hand.
- Translate only an explicit provider 404 into `null`, an empty listing, a
  per-repository missing result or an absent username. On GitLab a username is
  also absent when its account is inactive or blocked. Gitea shows an
  account's state only to a site admin or to the account itself, so every
  account Gitea finds is present. Network, timeout, authentication, rate-limit
  and other provider failures must propagate to the application layer.
- A reply that lacks a field its answer depends on, such as a clone URL, an
  account state or a default branch, fails the call. In a repository batch
  create it fails that repository's entry. It never reads as absence, an empty
  result or a skipped entry.
- A branch update writes plain files only. A folder, symbolic link or
  submodule at a changed path fails the call. GitHub has one exception: its
  content read answers a symbolic link to a normal file with that file. The
  update then writes to the link's path, and GitHub decides whether to refuse
  the write or replace the link. The update lands on a pull request branch, so a
  replaced link shows in its diff.

## Adding Git Capabilities

1. Extend interfaces/types in `@repo-edu/integrations-git-contract`.
2. Assign the operation to one capability owner in each provider.
3. Implement GitHub, GitLab and Gitea behaviour (or document intentional
   provider gaps).
4. Add behaviour and failure-path tests to the matching provider capability
   suite. The suites name every call an exclusive command makes with each
   answer its failures give. Fake replies follow the provider's own API
   definition: Gitea and GitLab at the versions
   `packages/integration-tests/docker-compose.yml` pins, and GitHub's REST
   reference.
