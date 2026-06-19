# CLAUDE.md

This file provides guidance to AI coding assistants when working in this
repository.

## Planning

Plans and design documents live in the sibling `../plan` repository, never in
this repo. When asked to write, draft or iterate on a plan, first read
`../plan/CLAUDE.md` and follow its workflow, file layout, naming, structure and
commit conventions. Keep this repo free of plan files so releases stay clean.

When an area has had two or more `fix:` commits among its last ten, do not
apply another. That repeated-fix signal is the frame round's prior-attempt
evidence, defined with the planning doctrine in `../plan/CLAUDE.md`; here it
obliges the round to stop patching and surface the area to the user as a
frame-round candidate in `../plan`. The pull across repos stays the user's,
since an implementation session cannot open a plan-repo round, so this rule
only makes the signal loud rather than letting another patch land silently.

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

## Architecture

`repo-edu` is a pure TypeScript pnpm monorepo. Workspace globs: `apps/*`,
`packages/*`, `tools/*`.

```text
repo-edu/
├── apps/
│   ├── desktop/   # Electron shell + tRPC router + preload bridge
│   ├── cli/       # Commander-based CLI (redu)
│   └── docs/      # Astro/Starlight site + browser-safe demo harness
├── packages/
│   ├── domain/                    # Pure product rules and validation
│   ├── application/               # Workflow orchestration/use-cases
│   ├── application-contract/      # Workflow ids/payloads/catalog + AppError
│   ├── renderer-host-contract/    # Renderer-safe host interface
│   ├── host-runtime-contract/     # Runtime ports (http/process/fs/user-file/llm/exam-archive)
│   ├── host-node/                 # Node implementations for runtime ports
│   ├── host-browser-mock/         # Browser mock host for docs/tests
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
    └── release/                   # Versioning/release helper
```

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
- [packages/host-browser-mock/CLAUDE.md](packages/host-browser-mock/CLAUDE.md)
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
- Keep browser-safe packages (`domain`, `application-contract`, `renderer-app`,
  docs-facing code) free of Node/Electron imports.
- Keep side effects in adapters/ports (`host-node`, integration adapters), not
  in domain logic.
- Do not introduce legacy settings/profile migration logic.
- Documents the user edits live canonically in the in-memory zustand store; save
  workflows write to disk and report success or failure. Only Load brings disk
  state into memory. Save handlers may return server-stamped fields the store
  cannot compute itself (e.g. a revision counter), never the full persisted
  document.

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

Sort implementation findings from A through D.

## Commit Severity Prefix

Prefix every commit with a sorted run-length sequence of [A]-[D] tier
counts: `A<n>B<n>C<n>D<n>: <subject>` enumerates how many concerns at
each tier the commit addresses, sorted A through D, with zero categories
omitted. Example: `B3C8D4 fix: <subject>` closes three B-tier, eight
C-tier and four D-tier concerns.

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

For commits that execute a plan, name the plan on the first body line
before the bullets: `Plan: <name>` where `<name>` is the file stem with
the `plan-` prefix dropped for peer plans (`plan-persister.md` →
`persister`), the plan's title for the root `plan.md`, or the topic the
plan was given when designed only in chat. Commits unattached to any
plan omit this line.

## Watched implementation rounds

An implementation-audit round can be observed by the watch: a shared
capability, independent of which repository is the working directory, that
reads the episode's trajectory and surfaces drift to the user. It runs only
when the user invokes the `/watch` slash command, never automatically
alongside a round and never as a gate, reduces the trajectory to a graded
verdict (green, amber or red), and detects, informs, suggests a response class
and asks; the decision is always the user's. The watch and its full rationale are
defined once with the planning doctrine in `../plan/CLAUDE.md`, so this note
carries only what is specific to implementation rounds here and the two do not
drift.

Only the episode anchor is repo-specific. The watch anchors on the
`Plan: <name>` first body line defined under **Commit Severity Prefix**, then
applies the shared scoping rule: walk from that anchor to HEAD including every
commit that shares the stem or touches the same churned files, and join the
`../plan` revision history for that stem so both trajectories read together.
Reactive rework that omits the `Plan:` line still falls in scope through the
churned-file test, which matters here because that rework is exactly what this
repo's commit convention leaves untagged.

## Testing Strategy

Tests are functional/behavioral — they verify *what* the code must do, not *how*
it's structured internally. Prefer tests at package boundaries:

- domain invariants in `packages/domain/src/__tests__`
- workflow behavior in `packages/application/src/__tests__`
- adapter/port tests in integration and host packages
- desktop bridge checks in `apps/desktop/scripts` + tests
- CLI golden/behavior tests in `apps/cli/src/__tests__`
- docs smoke and guardrail tests in `apps/docs/src/__tests__`
