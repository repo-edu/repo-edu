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

- `src/live-run.ts` — the suite's entry: seeds the run fixture, runs the five live test files in
  one process, removes the fixture and prints the GitHub write count
- `src/run-fixture.ts` — the one fixture a run seeds: a course whose two planned student
  repositories exist on the server, the first with the server's initial commit and the second empty
- `src/create-clone-operations.test.ts` — provider-operation live reply tests for Create and Clone
- `src/update-username-operations.test.ts` — provider-operation live reply tests for Update and
  username import
- `src/repo-create.test.ts`, `src/repo-clone.test.ts`, `src/repo-discover.test.ts` — the command
  cases that push or clone through git
- `src/fixture-adapter.ts` — bridges `@repo-edu/test-fixtures` into integration context
- `src/*-harness.ts` — provider-specific harnesses (Gitea, GitHub, GitLab)
- `src/provider-matrix.ts` — resolves active harnesses from `INTEGRATION_GIT_PROVIDERS` env
- `src/github-request-admission.ts` — the one GitHub admission owner: pacing, terminal stop, hourly
  record and write count

## Rules

- A command-level case stays live only when it drives a transport the operation tests do not: a git
  push or clone against the server. A case a server reply decides belongs to the operation tests,
  and a case about command logic belongs to the application unit tests with fakes.
- The Clone, Discover and Update tests read the run fixture and create nothing but the branches and
  pull requests Update writes. The Create command test and the operation tests create what they
  test under their own prefixes, in a fresh organisation on Gitea and GitLab, and clean up in
  `finally`.
- Selecting a provider without its required endpoint or credentials fails before tests start.
- Default provider when `INTEGRATION_GIT_PROVIDERS` is unset: `gitea`.
- Product calls use an ordinary teacher token. Gitea and GitLab admin tokens only seed and clean up.
- Gitea's `/data` tmpfs stays executable so its generated Git receive hooks can maintain the branch
  records that later API calls read.
- GitHub resources carry a per-run prefix and are removed in `finally`; the token owner must own the
  disposable test organisation.
- The five live test files run in one process through `node:test`'s `run()` with isolation `none`,
  so one run fixture and one GitHub admission owner cover the whole run. The owner paces every
  mutating raw-harness and product-adapter request by one second. A `403` or `429` stops every
  later provider request in that run. It never retries.
- The admission owner also keeps the local hourly record. When it admits the run's first mutation,
  it refuses the run if the previous record is younger than an hour and otherwise writes the new
  start time. A run that creates nothing, such as one refused for a missing or wrong token, leaves
  the record alone. The record is a safety boundary: do not delete, override or bypass it after a
  small fix. Use static and unit checks, then wait for the next content window.
- Provider-operation checks read the resulting files and pull requests through the harness's raw
  setup client, independently of the product adapter.
- No exports — purely executable test package.
