# CLAUDE.md

This file provides guidance to AI coding assistants when working in this
repository.

## Planning

Plans and design documents live in the sibling `../plan` repository, never in
this repo.

The [tooling design document](../plan/notes/tooling-design.md) explains the planning and audit
tooling's system-wide structure and reasons. The
[tooling user guide](apps/docs/src/content/docs/tooling/index.md) explains each tool's purpose and
loop, which commands to use and which decisions are the user's. The plan doctrine's
[Layout](../plan/CLAUDE.md#layout) owns their mirror status and the duty to keep them in sync with
changes to the tooling.

Areas are stable IDs in
`tools/architecture-check/src/area-model.json`. Attribute touched tracked source
files to their primary area ID. Cover area IDs are context for cross-cutting
concerns, not primary ownership.

Follow the shared protocol's
[History reads](.agents/references/round-protocol.md#history-reads) for audit
and review history.

The user never reads or edits machine artifacts such as the area model,
ledgers or generated files. Do not justify a feature or proposal by their
upkeep or readability.

Rule text, `CLAUDE.md` files included, states each decision and its reason,
never who directed it or when. The plan doctrine's
[Mechanism cases](../plan/CLAUDE.md#mechanism-cases) owns this rule.

Before adding a tracked source file under `apps/*/src`, `packages/*/src` or
`tools/*/src`, assign it to one primary area from the area model. If no existing
primary area owns it, update the area model in the same change.

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
pnpm test tools/audit-round
```

`pnpm audit-round example 3` runs an implementation-audit round for
the named plan and step from either checkout. The
[runner documentation](tools/audit-round/CLAUDE.md#commands) owns command
options, settings and outcomes. Its [Round files](tools/audit-round/CLAUDE.md#round-files)
and [Phase routing](tools/audit-round/CLAUDE.md#phase-routing) sections own file
names and manual phase paths.

- `fmt` — markdown formatting via rumdl
- `fix` — markdown auto-fix + Biome auto-fix
- `check` — fix + typecheck + build:types + check:fixtures +
  check:architecture
- `test` — runs all package tests workspace-wide, or one package when given its
  workspace-relative path
- `file-sizes` — tree-style line/file counts per subfolder for a given directory
  (`pnpm file-sizes` for options)

Run `fix` after a small change and `check` after a large one; either one closes
a piece of work. Run `test` yourself when a plan asks for it or the change
touches tested behaviour, rather than leaving the run to the user. Never run
`dev`, `preview` or `build`: the user runs those. After changing a dependency
manifest run `pnpm install` yourself and say so when you start it, because a
cold install can run long with no output and must not be aborted. Never edit
`pnpm-lock.yaml` or any other lockfile by hand; the lockfile that lands in a
commit is the one `pnpm install` wrote.

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
    ├── audit-round/               # Implementation-audit rounds and CLI contract recorder
    ├── dev-fixture/               # Local seed runner (pnpm dev:fixture)
    ├── file-sizes/                # Tree-style line/file counter (pnpm file-sizes)
    ├── fixture-cli/               # `pnpm fixture` entry into @repo-edu/fixture-engine
    ├── fixtures-check/            # Validates @repo-edu/test-fixtures matrix
    ├── release/                   # Versioning, signing and runtime-notice gates
    └── sweep/                     # Source-growth triage (pnpm sweep)
```

After adding, removing or moving a `CLAUDE.md`, run
`node scripts/claude2assistants.mjs` to refresh the gitignored `AGENTS.md`
symlinks other assistants read. Content edits need no run; the symlinks serve
current content by construction.

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

The audit-round, architecture-check, release and sweep tools and the analysis-workflows
sub-area carry their own `CLAUDE.md` too:

- [tools/architecture-check/CLAUDE.md](tools/architecture-check/CLAUDE.md)
- [tools/audit-round/CLAUDE.md](tools/audit-round/CLAUDE.md)
- [tools/release/CLAUDE.md](tools/release/CLAUDE.md)
- [tools/sweep/CLAUDE.md](tools/sweep/CLAUDE.md)
- [packages/application/src/analysis-workflows/CLAUDE.md](packages/application/src/analysis-workflows/CLAUDE.md)

Core flow:

1. `packages/renderer-app` exposes a session operation gateway. Its owner alone
   holds the raw `WorkflowClient` and orders complete session-changing bodies.
2. `apps/desktop` validates every renderer entry through one gateway. Ordinary
   workflows use its desktop-owned tRPC adapter; exclusive commands and clean
   close use request ports. `apps/cli` runs workflows in-process.
3. `packages/application` orchestrates use-cases using ports/contracts.
4. `packages/domain` owns pure semantics and invariants.

## Critical Rules

- Do not add ad hoc IPC for workflow execution. Only the desktop entry gateway
  registers renderer IPC. It validates the current document and complete input
  before host admission, ordinary tRPC dispatch or request-port execution.
- The host admission reducer owns command preparation, execution, settlement,
  close and terminal failure. The renderer session operation owner freezes all
  semantic changes from command reservation through retirement.
- `composeCourseCommandTransition` owns the complete next course for each
  course-changing command. Durable save and renderer application consume that
  value with its host stamp; features never merge partial command results.
- One desktop process owns one renderer document. Normal shutdown asks the
  child-process controller to end owned work; confirmation expiry warns and
  exits without starting an updater. An uncaught main-process exception logs
  synchronously and exits immediately. Only process exit releases the program gate.
- Keep the desktop renderer runtime closure and independently browser-safe roots
  (`renderer-host-contract`, `integrations-llm-contract`,
  `host-runtime-contract`, `test-fixtures`) free of Node built-ins. The
  application package is Node-hosted.
- Keep side effects in adapters/ports (`host-node`, integration adapters), not
  in domain logic.
- The desktop and compiled CLI claim the same program gate at the resolved
  app-data root before product work starts. Hold the claim until no
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
first, raises security fixes immediately and runs lock-file maintenance to
re-resolve transitives forward within range. A lock-file refresh gives Renovate
no release date to check, so Renovate's maturity window would keep it pending
forever. That window is therefore off for lock-file maintenance, and pnpm's own
`minimumReleaseAge` default holds new transitive releases back instead. Green
updates fast-forward onto
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

Package license notices follow the good-faith evidence rules in
`tools/release/CLAUDE.md`. A new package version alone must not require a
license clarification or approval-list edit. Read its installed evidence and
apply the existing license policy; tests assert that behaviour rather than a
package's current notice layout.

When adding, promoting or replacing a dependency, check the current published
version first with `pnpm view <pkg> version` and adopt current unless a
concrete repo constraint argues otherwise; record any deliberate pin in the
plan or commit body.

The default pnpm catalog owns the admitted version of a desktop runtime
external when more than one workspace manifest declares it. A new consumer
uses the catalog's existing version. Promoting a package across the desktop
runtime boundary and upgrading that package are separate changes.

## Implementation Review Findings

When asked to review implementation code, prefix every finding title with an implementation severity
tier. Use the [implementation tiers](.agents/references/round-protocol.md#implementation-tiers) in
the shared round protocol.

Use the [audit report grammar](.agents/references/round-grammar.md#audit-report)
for finding order and numbering and the shared protocol's
[Finding explanations](.agents/references/round-protocol.md#finding-explanations)
for their substance.

## Commit Severity Prefix

Omit routine test and check results from commit messages.

The [shared severity sequence](.agents/references/round-protocol.md#severity-sequence)
owns the counts, reach marks and whole-commit burden marks. Follow it for every
file-changing commit except a plan step. The
[subject grammar](.agents/references/subject-grammar.md) owns their placement.

Use the shared [finding metadata](.agents/references/round-protocol.md#finding-metadata)
and the [record bullet grammar](.agents/references/round-grammar.md#commit-record-bullet)
for every graded concern, D included, including off-plan work. The primary area
owns supporting documentation too. Steps and markers carry no graded bullets.

The shared [implementation tiers](.agents/references/round-protocol.md#implementation-tiers) grade a
concern's severity whether the AI surfaced it formally in a review or only addressed it in the
commit body. Grade each concern against that rubric in its bullet.

The conventional commit kind is the last tag before the sentence, from the
closed list the subject grammar admits:
`abx growth-none B3C8d4 fix(renderer-app): surface session command errors`.

`redesign` is the typical kind at tier A, alongside `refactor`, `feat`
and `docs`. `fix` is essentially never tier A: an A-tier bug fix is a
redesign that closes a bug, and commits as `A1` with `redesign` and the bug
named in the sentence.

Plan-related commits use the shared `<stem>/` forms. Their meaning and keying
are owned by the plan repo doctrine at
`../plan/CLAUDE.md#shared-implementation-forms` and their shape by the subject
grammar. Use those owners for plan identity and step numbers. A commit unattached to
a plan keeps this repo's ordinary severity-prefixed conventional subject.

For implementation-audit records, follow the plan repo's
[Shared implementation forms](../plan/CLAUDE.md#shared-implementation-forms)
for record placement, the
[shared round protocol](.agents/references/round-protocol.md) for finding
metadata and the [fix workflow](.agents/skills/fix/references/workflow.md#records)
for record writing.

Follow the plan doctrine's **Shared implementation forms** for cross-repo
deferrals and directed plan-file fixes.

## Commit Capability Tag

Every commit subject except the runner-written `settle` and `ready` plan
markers carries a three-character tag naming what produced it: the assistant,
the strength and the effort, one letter each. Those two markers record the
user's call without running an assistant, so attributing them to one would be
false.

- `a` for Claude and `o` for Codex, naming the vendor rather than the product,
  because both products start with a C.
- `b` for the base tier and `t` for the top one, matching how the work runs,
  with the default model one tier below the highest. `u` says the model is
  unlisted, on neither tier, and the body's model record says which it was.
- `l`, `m`, `h` and `x` for the four reasoning efforts.

So `atx` is Claude at the top tier and xhigh effort, and `obm` is Codex at its
default tier and medium effort. The three alphabets share no character, so every
letter decodes without counting positions, and the tag holds no digit, which a
subject already spends on the severity sequence's counts.

The tag opens a tagged subject, after the plan form when the subject has one,
as `abx growth-none c1d1 fix(audit-round): align the recorder result`. Its
place in every subject class is fixed by
[the subject grammar](.agents/references/subject-grammar.md).

The tag names the assistant whose work the subject reports. On a
planning or implementation-audit record that is the audit, not the session that wrote the
commit: one setting picks the fixer whoever audited, so a writer's tag would
repeat that setting on every record, while the auditor is what the trajectory
reads off a clean one.
The role token right before the tag says which kind of subject it is, and a
reader needs that token anyway for the scope and the severity.

The session writes its own tag for work outside a round. A session the runner
starts cannot read its own effort, so the runner's standalone close receives
its tag in its phase arguments. A round's fix writes
the full auditor tag from the report filename. The commit hook, this repo's
`.husky/commit-msg` or the plan repo's `hooks/commit-msg`, replaces it with
`COMMIT_AUDITOR` when the runner supplies that value.

## Commit Model Record

Every commit body except a runner-written `settle` or `ready` marker opens with
the model the work ran on, so the log says what produced a change without
spending subject width on it. Those two commits run no model and carry no model
record. The [subject grammar](.agents/references/subject-grammar.md#commit-model-record)
owns both record forms and their examples.

The watch phase stays out because it writes a document rather than landing
work. A later implementation audit uses the recorded audit, vet and
rebuttal time as the cost of the round on the same scope.

The model is the one the CLI reported running, never the one the round asked
for: `claude-opus-5`, not `opus`. An alias names whichever release is current,
so it would stop being true of the commit it sits in. The effort is one of
`low`, `medium`, `high` and `xhigh`.

`audit-round` passes a round record to the phase that commits, because it holds
every phase's reported model and that session does not. The standalone close is
no round, so it receives its one-line record in its phase arguments and writes
it itself. An implement worker receives its reported model release and launched
effort in its phase arguments. Its step record adds `Implementation took <n>
min.`, where the implementation workflow owns the active-time measurement and
the split across a step hosted in both repos. A hand-run session committing on
its own writes its own line: it knows the model it was told to run and reads its
effort from the environment.

Repo Edu's `.husky/commit-msg` and the plan repo's `hooks/commit-msg` write the
record when a round supplies it. Each hook refuses any non-merge commit whose
body does not open with a model record, except the tag-free `settle` and `ready`
forms. It checks the line's shape rather than a list of model names, so a new
model family needs no edit here. It also refuses a single-model record whose
effort disagrees with the subject's tag. A step commit without its active-time
line is refused. A `ready` marker has no model record, but its body must carry
the assigned coder.

## Vocabulary

Every project term has exactly one defining entry, in one of three tiers. A term
used across the app is defined in this section. A term shared by a few packages
is defined in one file under `glossaries/`, named after a subject the code
already carries: a package family or a domain name. A term used in one package
only is defined in a **Vocabulary** section of that package's `CLAUDE.md`. A
term the home planning vocabulary defines keeps that entry as its only owner.
Plans, audit rounds and other instruction files use a term by reference and
never copy its definition, because a copy drifts from its owner.

The glossary files are `glossaries/child-process-lifetime.md`,
`glossaries/program-gate.md` and `glossaries/analysis.md`. A package
`CLAUDE.md` that one of them governs names it in its opening sentence. Before
working on a rule in this file, or on a root-level file, that uses a glossary
file's terms, read that file. The renderer session's own terms, such as
bootstrap and hydrate, are in `packages/renderer-app/CLAUDE.md`.

Two tests answer two different questions:

1. The entry test decides whether a term gets an entry. It does when a fresh
   session could plausibly coin a different name for the concept or misread
   the word. Ordinary domain nouns such as course, roster or assignment stay
   out.
2. The reading test decides whether a defined term may be used bare in chat.
   It is the home policy's pair of tests: the plain expansion reads worse at
   every use, and the user meets the term often enough to learn it. A term
   that fails it is expanded where it is used, wherever its entry lives.

One test cannot do both jobs. The reading test would keep a rarely met name
out, and the entry test would license a bare word the user has never met.

A change that introduces a project term passing the entry test adds its entry
in the same change, in the tier above. An audit treats a coined name without an
entry, or a second name for a concept that already has one, as a finding under
the ordinary tiers. The rule exists because a name coined without an entry
spreads silently through code, tests, instructions and plans, and its only
repair is a rename plan: unwinding three such names once took a plan of about
700 lines across more than 50 files.

Each entry is a bold term followed by a short plain explanation that teaches the
concept to a reader who does not know the source ecosystem's jargon, without
pointing at an outside reference. Entries name concepts and roles, never code
identifiers, because identifier lists go stale with every rename.

- **adapter**: an implementation that maps one contract onto something outside
  it. Name the sense wherever the bare word could mislead. A provider adapter
  talks to one outside service, such as an LMS, a Git host or an LLM provider.
  A platform adapter is the operating-system sense that
  `glossaries/child-process-lifetime.md` defines. A coding adapter is the plan
  runner's driver for one Claude or Codex coding session, kept apart from the
  product's LLM provider adapters. Other adapters, such as the desktop's
  workflow transport adapter, take only the general meaning.
- **admission**: the check run at the moment a result or record arrives that
  decides whether it is allowed to land, into session state or into the archive.
- **area model**: the committed `tools/architecture-check/src/area-model.json`
  that gives every source file in the source inventory one primary owner and
  records cross-cutting concerns. It is made of partition areas and cover areas,
  each with a stable ID.
- **body**: the function a queued session command runs when its turn comes; it
  awaits its host work and commits its result before the next body starts.
- **browser-safe**: free of Node built-ins across the whole runtime import
  closure, so the sandboxed renderer can load it. The architecture check proves
  it for the renderer and for each independently browser-safe root.
- **commit**: the final step that makes a result count by writing it into the
  session's official state; only queued bodies may commit.
- **contract package**: a package, named with a `-contract` suffix, that
  declares the types, schemas and interfaces one side implements and the other
  calls, without the implementation itself.
- **course backing**: where a course's people come from, chosen when the course
  is set up. An LMS-backed course keeps a student roster and may link to a
  course in the school's LMS. A RepoBee-backed course has no LMS link and works
  from teams of Git usernames instead of a roster.
- **course data**: the content of one course: its name, student and team roster,
  LMS link, repository template and clone settings, analysis settings and
  revision number. Saved and loaded only as one whole course, never in parts.
- **course database**: the one shared file holding every course at rest; the
  only saved home of course data. Settings, window state and the examination
  archive live elsewhere.
- **cover area**: an area-model area that may overlap others and marks a
  cross-cutting concern, used as audit and drift context. It never owns a file
  and never creates an import boundary.
- **fixture**: generated stand-in data. Two senses share the word, so name the
  sense. Deterministic fixture data is the seeded course, settings and file
  data that tests across the monorepo share. A generated fixture repository is
  a realistic student Git repository that the fixture engine, a developer-only
  AI-driven tool, writes for the analysis features; its own terms live in
  `packages/fixture-engine/CLAUDE.md`.
- **group-set naming mode**: whether a group set is named or unnamed. A named
  group set holds named groups of roster members. An unnamed group set holds
  teams listed only by their members' Git usernames, as a RepoBee student list
  does, so a repository name cannot use a group name.
- **host**: four senses share the word, so name the sense. The host process
  and the Codex SDK host process are the process senses that
  `glossaries/child-process-lifetime.md` defines; the second is never a host
  process itself. A host package is one of the packages
  named for the host side: `host-node`, `host-runtime-contract` and
  `renderer-host-contract`. The renderer host bridge is the interface the
  desktop gives the sandboxed renderer for native actions such as file pickers
  and clean close.
- **partition area**: an area-model area that owns source files. The partition
  areas together cover every file in the source inventory exactly once, and
  their import boundaries are enforced. The partition area that owns a file is
  its primary area.
- **port**: an interface for one outside capability that the application
  depends on, such as HTTP, processes, the file system or an LLM. The
  `host-runtime-contract` package declares the ports and `host-node` implements
  them for Node.
- **reducer**: a function that takes the current state and one event and returns
  the next state; the only place session state is allowed to change.
- **row**: one entry in a database, like one line in a table. In the course
  database each row is one complete course: all its course data in one entry,
  replaced whole on every save.
- **session**: the renderer's live working context from startup to teardown:
  loaded settings, courses, the active surface, the stores and the workers
  persisting them.
- **source inventory**: the list of current TypeScript source files under
  `apps/*/src`, `packages/*/src` and `tools/*/src`, untracked ones included,
  that the area model must cover and every architecture check reads.
- **surface**: the main content view the session has active, a course view or
  home; changing it is a surface transition.
- **worker**: a long-lived background helper that writes changes to disk on its
  own schedule; it reports status but may not commit session state.
- **workflow**: one named unit of application work with a fixed input and
  result shape, listed in the application contract's catalogue. The desktop
  runs it through its entry gateway and the command-line program runs it
  in-process.

## Testing Strategy

Tests are functional/behavioral — they verify *what* the code must do, not *how*
it's structured internally. Prefer tests at package boundaries:

- domain invariants in `packages/domain/src/__tests__`
- workflow behavior in `packages/application/src/__tests__`
- adapter/port tests in integration and host packages
- desktop bridge checks in `apps/desktop/scripts` + tests
- CLI golden/behavior tests in `apps/cli/src/__tests__`
