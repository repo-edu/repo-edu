# CLAUDE.md

This file provides guidance to AI coding assistants when working in this
repository.

## Planning

Plans and design documents live in the sibling `../plan` repository, never in
this repo.

Areas are stable IDs in
`tools/architecture-check/src/area-model.json`. Before applying another fix,
read the conventional kind from the postfix of a stem-marked file-changing
commit or after the severity sequence of an ordinary commit. Attribute touched
tracked source files to their primary area ID and walk history until that area
has ten touched commits. If two or more of those commits are `fix:` commits, do
not apply another patch. Surface the area ID to the user as a frame-round
candidate in `../plan`. Cover area IDs are context for cross-cutting concerns,
not primary ownership.

Before splitting a tracked source file, name the source file's current primary
area ID and the child area ID each output file will join. If the split creates
a new primary concern, update the area model in the same change and record
`splitFrom`.

## Build and Development Commands

Use pnpm scripts only. All validation runs from the workspace root:

```bash
pnpm install
pnpm fmt
pnpm fix
pnpm check
pnpm test
```

- `fmt` — markdown formatting via rumdl
- `fix` — markdown auto-fix + Biome auto-fix
- `check` — fix + typecheck + build:types + check:fixtures +
  check:architecture
- `test` — runs all package tests workspace-wide
- `file-sizes` — tree-style line/file counts per subfolder for a given directory
  (`pnpm file-sizes` for options)

A coding turn started by the automated plan runner is the exception. It uses
affected package `check` scripts and focused test files for feedback. It never
runs root `pnpm fix`, `pnpm check` or `pnpm test`. The runner owns scoped format
and lint fixes. It also owns the independent package checks and tests and the
final root checks and tests.

## Architecture

`repo-edu` is a pure TypeScript pnpm monorepo. Workspace globs: `apps/*`,
`packages/*`, `tools/*`.

```text
repo-edu/
├── apps/
│   ├── desktop/   # Electron shell + tRPC router + preload bridge
│   ├── cli/       # Commander-based CLI (redu)
│   └── docs/      # Static Astro/Starlight documentation site
├── packages/
│   ├── domain/                    # Pure product rules and validation
│   ├── application/               # Workflow orchestration/use-cases
│   ├── application-contract/      # Workflow ids/payloads/catalog + AppError
│   ├── renderer-host-contract/    # Renderer-safe host interface
│   ├── host-runtime-contract/     # Runtime ports (http/process/fs/user-file/llm/exam-archive)
│   ├── host-node/                 # Node ports, program gate and host lifetime control
│   ├── integrations-git(-contract)
│   ├── integrations-lms(-contract)
│   ├── integrations-llm(-contract,-catalog)  # Provider-neutral LLM contract,
│   │                                         # Claude/Codex adapters, curated model catalog
│   ├── claude-coder/              # Private dev-only Claude Code fixture coder
│   ├── fixture-engine/            # AI-driven student-repo fixture generator
│   ├── tree-sitter-grammar-assets/ # Browser-safe source-tokenizer grammar WASM assets
│   ├── renderer-app/              # Shared React application
│   ├── ui/                        # Shared UI component library
│   ├── test-fixtures/             # Shared domain fixture generation (faker-based)
│   └── integration-tests/         # E2E workflow tests against live Git providers
└── tools/                         # Workspace tooling (each runs via tsx)
    ├── architecture-check/        # Boundary/architecture lint (pnpm check:architecture)
    ├── dev-fixture/               # Local seed runner (pnpm dev:fixture)
    ├── file-sizes/                # Tree-style line/file counter (pnpm file-sizes)
    ├── fixture-cli/               # `pnpm fixture` entry into @repo-edu/fixture-engine
    ├── fixtures-check/            # Validates @repo-edu/test-fixtures matrix
    ├── plan-implementation/       # Private deterministic plan runner
    ├── release/                   # Versioning, signing and runtime-notice gates
    └── sweep/                     # Source-growth triage (pnpm sweep)
```

The committed area model is
`tools/architecture-check/src/area-model.json`. Partition areas tile the current
Git worktree source files exactly once and define primary ownership. Cover areas
overlap the partition for cross-cutting audit and drift context only.

Each app and package has its own `CLAUDE.md` with purpose, constraints, and
non-obvious conventions:

- [apps/cli/CLAUDE.md](apps/cli/CLAUDE.md)
- [apps/desktop/CLAUDE.md](apps/desktop/CLAUDE.md)
- [apps/docs/CLAUDE.md](apps/docs/CLAUDE.md)
- [packages/application/CLAUDE.md](packages/application/CLAUDE.md)
- [packages/application-contract/CLAUDE.md](packages/application-contract/CLAUDE.md)
- [packages/claude-coder/CLAUDE.md](packages/claude-coder/CLAUDE.md)
- [packages/domain/CLAUDE.md](packages/domain/CLAUDE.md)
- [packages/fixture-engine/CLAUDE.md](packages/fixture-engine/CLAUDE.md)
- [packages/host-node/CLAUDE.md](packages/host-node/CLAUDE.md)
- [packages/host-runtime-contract/CLAUDE.md](packages/host-runtime-contract/CLAUDE.md)
- [packages/integration-tests/CLAUDE.md](packages/integration-tests/CLAUDE.md)
- [packages/integrations-git/CLAUDE.md](packages/integrations-git/CLAUDE.md)
- [packages/integrations-git-contract/CLAUDE.md](packages/integrations-git-contract/CLAUDE.md)
- [packages/integrations-llm/CLAUDE.md](packages/integrations-llm/CLAUDE.md)
- [packages/integrations-llm-catalog/CLAUDE.md](packages/integrations-llm-catalog/CLAUDE.md)
- [packages/integrations-llm-contract/CLAUDE.md](packages/integrations-llm-contract/CLAUDE.md)
- [packages/integrations-lms/CLAUDE.md](packages/integrations-lms/CLAUDE.md)
- [packages/integrations-lms-contract/CLAUDE.md](packages/integrations-lms-contract/CLAUDE.md)
- [packages/renderer-app/CLAUDE.md](packages/renderer-app/CLAUDE.md)
- [packages/renderer-host-contract/CLAUDE.md](packages/renderer-host-contract/CLAUDE.md)
- [packages/test-fixtures/CLAUDE.md](packages/test-fixtures/CLAUDE.md)
- [packages/tree-sitter-grammar-assets/CLAUDE.md](packages/tree-sitter-grammar-assets/CLAUDE.md)
- [packages/ui/CLAUDE.md](packages/ui/CLAUDE.md)

The architecture-check, plan-implementation, release and sweep tools and the
analysis-workflows sub-area carry their own `CLAUDE.md` too:

- [tools/architecture-check/CLAUDE.md](tools/architecture-check/CLAUDE.md)
- [tools/plan-implementation/CLAUDE.md](tools/plan-implementation/CLAUDE.md)
- [tools/release/CLAUDE.md](tools/release/CLAUDE.md)
- [tools/sweep/CLAUDE.md](tools/sweep/CLAUDE.md)
- [packages/application/src/analysis-workflows/CLAUDE.md](packages/application/src/analysis-workflows/CLAUDE.md)

Core flow:

1. `packages/renderer-app` invokes workflows through `WorkflowClient` from
   `@repo-edu/application-contract`.
2. `apps/desktop` provides that client over `trpc-electron`; `apps/cli` runs
   workflows in-process.
3. `packages/application` orchestrates use-cases using ports/contracts.
4. `packages/domain` owns pure semantics and invariants.

## Critical Rules

- Do not add ad hoc IPC for workflow execution. Desktop workflow calls must go
  through the typed tRPC router.
- Keep the desktop renderer runtime closure and independently browser-safe roots
  (`renderer-host-contract`, `integrations-llm-contract`,
  `host-runtime-contract`, `test-fixtures`) free of Node built-ins. The
  application package is Node-hosted.
- Keep side effects in adapters/ports (`host-node`, integration adapters), not
  in domain logic.
- The desktop and compiled CLI claim the same program gate at the resolved
  application-data root before product work starts. Hold the claim until no
  more product work can run. The gate and app-data-root resolution belong to
  `host-node`.
- Preserve the packaged Windows child-process lifetime proof: a fixed launcher entry,
  explicit Electron `runAsNode`, job assignment before the target command may
  be accepted, a saved same-turn process identity and a non-inherited job
  handle.
- The child-process lifetime controller owns the one terminal outcome for Git,
  subscription Claude, app Codex and plan-step Codex runs. Callers report
  result, proving-connection and cancellation facts. A reported-proof process
  needs no separate work-start fact. Callers never rank or compose run
  failures.
- Every outside-program outcome except confirmation-expiry unknown leaves the
  controller only after its whole owned tree is confirmed gone. Forced-stop
  confirmation has a five-second deadline. An expiry sends one diagnostic and
  one user warning, releases the run's local streams and returns unknown for an
  active run. The session continues. At shutdown the same warning is followed
  by exit. Windows keeps an unconfirmed tree's job handle open until process
  exit.
- Release validation must prove the program gate in the packaged desktop and
  compiled CLI artifacts. Packaged Windows validation must also prove the
  child-process lifetime contract.
- Do not introduce legacy settings/profile migration logic.
- Documents the user edits live canonically in one in-memory owner. The renderer
  session owns preferences and credentials; the course Zustand store owns the
  active course. Save workflows write to disk and report success or failure.
  Only Load brings disk state into memory. Save handlers may return
  server-stamped fields the owner cannot compute itself (e.g. a revision
  counter), never the full persisted document.

## Dependency Currency

Keep the installed tree current. An obsolete package is a concern whether it
arrived as a direct or a transitive dependency; the unit of concern is the
resolved version lagging its latest published release, not how it got there.

Renovate is the standing mechanism (`renovate.json`): it groups and schedules
updates (AI SDKs on a tighter cadence than the long tail), holds each new
release for a maturity window before adopting it so others hit the early bugs
first, raises security fixes immediately, and runs lock-file maintenance to
re-resolve transitives forward within range. Green updates fast-forward onto
`main` once CI passes on a `renovate/**` branch; a PR surfaces only when CI
fails. So an upstream release produces a gated branch, never a direct build
failure on `main`.

Electron is a stricter runtime-carrier exception: patch/minor updates run weekly
after a short maturity window, major updates run monthly, and CI must package and
smoke-run the desktop app before those branches are trusted to fast-forward.

For local or out-of-band catch-up run `pnpm deps:latest`
(`pnpm up -r --latest && pnpm dedupe`): it moves direct deps to latest and
re-resolves transitives forward. Never pin a transitive past what its parent
allows. When a current direct dep still constrains a sub-package to an old
version, that is the upstream maintainer's lag — accept it, do not add a
`pnpm.overrides` entry forcing a version the parent was not tested against.

When adding, promoting or replacing a dependency, check the current published
version first with `pnpm view <pkg> version` and adopt current unless a
concrete repo constraint argues otherwise; record any deliberate pin in the
plan or commit body.

The default pnpm catalog owns the admitted version of a desktop runtime
external when more than one workspace manifest declares it. A new consumer
uses the catalog's existing version. Promoting a package across the desktop
runtime boundary and upgrading that package are separate changes.

## Implementation Review Findings

When asked to review implementation code, prefix every finding title with an
implementation severity tier:

- `[A]`: Data loss, corruption, a broken core workflow or an architectural flaw
  likely to ship silently or require broad rework.
- `[B]`: A real user-visible bug, reliability issue or unresolved code
  decision that must be settled before shipping.
- `[C]`: A narrow correctness, maintainability or test-coverage issue in a
  non-critical path.
- `[D]`: Wording, style, formatting or low-risk polish.

Present implementation findings as one numbered list sorted from A through D.
Start at 1 and keep the numbers increasing across tier changes, so the user can
refer to one finding without restating it.

## Commit Severity Prefix

Every file-changing commit carries a sorted run-length sequence of [A]-[D]
tier counts. An ordinary commit prefixes its conventional subject with
`A<n>B<n>C<n>D<n>`. A plan-related commit places the same sequence in its
shared stem form. The sequence enumerates how many concerns at each tier the
commit addresses, sorted A through D, with zero categories omitted. Example:
`B3C8D4 fix: <subject>` closes three B-tier, eight C-tier and four D-tier
concerns.

The [A]-[D] rubric in Implementation Review Findings grades a concern's
severity whether the AI surfaced it formally in a review or only
addressed it in the commit body. Grade each concern the commit addresses
against the rubric and count by tier; a planned redesign that reshapes
ownership across packages is `A1 redesign:`, a within-package bug fix is
`B1 fix:`, a localised maintainability fix is `C1 fix:`, a typo is
`D1 docs:` or `D1 fix:`. Larger audit closures compound into sequences
like `A1B4C2:` for one architectural concern, four B-tier bugs and two
C-tier issues closed together.

The conventional commit kind follows the prefix:
`B3C8D4 fix(renderer-app): surface session command errors`.

`redesign:` is the typical kind at tier A, alongside `refactor`, `feat`
and `docs`. `fix:` is essentially never tier A: an A-tier bug fix is a
redesign that closes a bug, and commits as `A1 redesign:` with the bug
named in the subject.

Plan-related commits use the shared `<stem>/` subject grammar defined in
[the plan repo doctrine](../plan/CLAUDE.md#shared-implementation-forms). The
subject is the only home for plan identity and step numbers. Use the shared
forms without restating them here. A commit unattached to a plan keeps this
repo's ordinary severity-prefixed conventional subject.

An implementation-audit round records each accepted finding in the repo whose
files the finding concerns. The plan's **Execution and audits** subsection
selects the batch. The hosting repos of its steps decide whether the round
judges this repo, the sibling plan repo or both. A both-repo round lands
independent records in each repo and writes one report at the root of the repo
where the round was invoked, named with both HEAD shas and that repo's sha
first. Each Repo Edu round commit
begins with its `Audit: complete`, `Audit: step <n>` or
`Audit: steps <a>-<b>` scope. Each accepted code finding bullet opens with the
finding's metadata tokens,
`- [area:<primary-id>] [growth:<labels>] [reach:<value>] [complexity:<value>]
<prose>`, so a later round can read the round's findings, their suspected
growth patterns and their reach and complexity ratings from the log alone.
The audit workflow at `.agents/skills/audit/references/workflow.md` owns that
format and the tokens' meaning; the patterns and their numbering live in
`../plan/GROWTH-PATTERNS.md`.

A plan-text finding deferred from a Repo Edu-only round stays in that Repo Edu
round commit. Its bullet starts with its tier and plan location before the
shared finding tokens:
`- [B] [plan:../plan/<topic>.md#<heading>] [growth:<labels>] [reach:<value>]
[complexity:<value>] <prose>`. Deferral is only for work nobody directed. When
the user directs a plan-file fix during the round, the same run applies it and
lands it as an independent plan-repo commit in the ordinary plan-round form.
No repo-local action automatically requires or waits on the other commit.

The automated runner alone adds one local form. Its severity-free cursor reset
subject is `<stem>/reset-<n>: reset cursor to step <n>`. Runner step and reset
commit bodies retain only `Plan-Source-Commit: <sha>` and
`Plan-Source-Blob: <sha>` as plan-source identity. The plan, step and reset
cursor are read from the subject.

## Testing Strategy

Tests are functional/behavioral — they verify *what* the code must do, not *how*
it's structured internally. Prefer tests at package boundaries:

- domain invariants in `packages/domain/src/__tests__`
- workflow behavior in `packages/application/src/__tests__`
- adapter/port tests in integration and host packages
- desktop bridge checks in `apps/desktop/scripts` + tests
- CLI golden/behavior tests in `apps/cli/src/__tests__`
