# CLAUDE.md

This file provides guidance to AI coding assistants when working in this
repository.

## Planning

Plans and design documents live in the sibling `../plan` repository, never in
this repo.

Areas are stable IDs in
`tools/architecture-check/src/area-model.json`. Before applying another fix,
read the conventional kind from the subject's last tag before the sentence.
Attribute touched
tracked source files to their primary area ID and walk history until that area
has ten touched commits. Commits with the `impl-audit-` role token do not
count, because audit rounds exist to produce fix commits. If two or more of the
counted commits are `fix:` commits, read that history before patching. When
the fixes are clean-up after a redesign, say so in one line and proceed. When
one design piece took two or more of them, name it, propose a structural
change and surface the area ID to the user as a frame-round candidate in
`../plan`. Cover area IDs are context for cross-cutting concerns, not primary
ownership.

The user never reads or edits machine artifacts such as the area model,
ledgers or generated files. Do not justify a feature or proposal by their
upkeep or readability.

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
```

`pnpm audit-round <plan> [<n>|<a>-<b>] [--auditor <tag>] [--chain] [--no-watch] [-v]` runs the
implementation-audit tool from this checkout root, ending with a plain-words brief of the round for
the user. A clean audit skips the vet and the rebuttal and goes straight to the fix, which lands the
clean record. A fix that stops for the user's ruling adds a ruling document, drafted and then
rewritten in a fresh session, which the user rules from. A round that finished ends with a glance at
the commit record, which decides whether the trajectory watch is due; a due watch adds its document,
drafted and rewritten the same way, and records its own grade so the next glance can count from it.
The glance is the runner's own read of the log, not a session, and `--no-watch` skips it and the
watch for every round of the run.
`--chain` runs at most three rounds on the scope the user named, keeping the auditor while an A or B
finding lands and giving the other assistant one closing round, and glances after each of them.
`--auditor` takes the capability tag a commit subject spells: `a` or `o` for the assistant, then an
optional `b` or `t` for the model tier and an optional `l`, `m`, `h` or `x` for the reasoning
effort. A named field binds the auditor and its rebuttal, because the rebuttal resumes the audit
session; an unnamed one follows that assistant's own settings, as every other phase does, and the
brief names its own model. The run's settings header names what set each phase.
`pnpm audit-round brief <target-round-tag-round.md>` writes that brief for an earlier round. The
shared file-name grammar and writer-tag rules live in
[the round protocol](.agents/references/round-protocol.md).
`pnpm audit-round <commit> [<commit>...]` or `pnpm audit-round <from>..<to>` audits named commits.
References accept SHAs, `HEAD` and `HEAD-<n>`, where `HEAD-1` is the previous first-parent commit.
Ranges include both endpoints. Commit audits run once, reject `--chain` and finish without a
trajectory glance or watch. `pnpm audit-round:contract [claude|codex|both]` records its live CLI
contracts.

- `fmt` — markdown formatting via rumdl
- `fix` — markdown auto-fix + Biome auto-fix
- `check` — fix + typecheck + build:types + check:fixtures +
  check:architecture
- `test` — runs all package tests workspace-wide
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

The committed area model is
`tools/architecture-check/src/area-model.json`. Partition areas tile the current
Git worktree source files exactly once and define primary ownership. Cover areas
overlap the partition for cross-cutting audit and drift context only.

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

Omit routine test and check results from commit messages.

Every file-changing commit except a plan step commit carries a sorted
run-length sequence of [A]-[D] tier counts. An ordinary commit prefixes its
conventional subject with that sequence. An implementation-audit record places
the same sequence in its shared stem form; a step commit lands planned work and
carries none. The sequence enumerates how many concerns at each tier the commit
addresses, with zero categories omitted. The commit hook derives the sequence,
its case and its `!` from the graded body bullets, overwriting any authored
value. Write the rest of the subject and the bullets; leave the sequence slot
to the hook.

Three marks carry reach and structure change into the sequence itself, because a
commit graph shows the subject and none of the finding tokens.

- Case says who meets the concern. A tier letter is uppercase when the concern's
  reach is `ordinary`, `rare` or `very-rare`, the values an end user can meet,
  and lowercase when its reach is `developer`.
- A leading `!` says at least one concern has `ordinary` reach, the value that
  needs no special condition to hold: `!B1C1c2d1`.
- A leading `growth-<level>` or `pruning-<level>` says what the commit did to the
  standing structure. Measure the commit, never add up the finding tokens:
  compare the code before the commit with the code after it, then take the
  highest kind of obligation whose count changed. The word gives the direction,
  `growth` when that kind grew and `pruning` when it shrank. The level names the
  kind, `low` for a rule, `medium` for state and `high` for an owner concern.
  Omit the whole mark when no kind changed. The direction is a word and not a sign,
  because a sign carries direction and not judgement: `+` reads as a gain where
  growth is the cost. The level is always written. A commit that moved only rules
  reads `growth-low` and never a bare `growth`, because an omitted level would
  pass as the floor and a level is countable in the log only when it is on the
  page. A commit can read `pruning-high` while one concern inside it added a
  rule, because the mark states the commit's own net result at its highest
  changed kind. It carries no colon of its own.

The mark precedes the sequence after a space: `abx pruning-high !B1C1c2d1`. It
leads because what a commit did to the standing structure outranks how many
concerns it closed, and a commit often carries the mark where the sequence is
routine.

The subject's shape, the order of its tags and which slots each kind of commit
fills, is owned by [the subject grammar](.agents/references/subject-grammar.md).
This section owns what the sequence and its marks mean.

Reach values are defined in the audit workflow under **Reach and complexity**,
which also defines the obligation kinds the leading mark measures. The mark and
the finding token `[complexity:...]` run that one measurement, so they translate
exactly: `growth-high` is `[complexity:high]`, `pruning-high` is
`[complexity:minus-high]` and an absent mark is `[complexity:none]`.

Plan rounds keep bare tiers. These marks describe shipped behaviour and the code
that carries it, which a plan document has not reached yet.

Every graded concern, D included, records one body bullet, including off-plan
work. Each uses `- [T] [area:<primary-id>] [growth:<labels>] [reach:<value>]
[complexity:<value>] <title and prose>`. Use the area that owns the concern,
including for its supporting docs, or `[plan:<location>]` in place of `[area:]`
for a deferred plan finding. The hook refuses missing tokens. Other decision
bullets take no tier. The glance counts repeated A–C corrections in the same
area; D findings do not advance that count. Steps and markers carry no graded
bullets. The user directed the body record on 2026-09-20 and its extension to
every graded concern on 2026-09-21.

The [A]-[D] rubric in Implementation Review Findings grades a concern's
severity whether the AI surfaced it formally in a review or only
addressed it in the commit body. Grade each concern against that rubric in its
bullet.

The conventional commit kind is the last tag before the sentence, from the
closed list the subject grammar admits:
`abx B3C8d4 fix(renderer-app): surface session command errors`.

`redesign` is the typical kind at tier A, alongside `refactor`, `feat`
and `docs`. `fix` is essentially never tier A: an A-tier bug fix is a
redesign that closes a bug, and commits as `A1` with `redesign` and the bug
named in the sentence.

Plan-related commits use the shared `<stem>/` forms. Their meaning and keying
are owned by the plan repo doctrine at
`../plan/CLAUDE.md#shared-implementation-forms` and their shape by the subject
grammar. The subject is the only home for plan identity and step numbers. Use
the shared forms without restating them here. A commit unattached to a plan
keeps this repo's ordinary severity-prefixed conventional subject.

An implementation-audit round records each accepted finding in the repo whose
files the finding concerns. The user's step range decides the repo set, which
is the union of the hosting repos for its steps. A single-repo round writes its
report in that repo, even when the round started in the other repo. A both-repo
round writes one report at the root of the repo where the round started. A
record lands only in a repo whose files took an accepted finding, so a both-repo
round with findings in one repo lands one record. A clean round lands one clean
record at the root that holds its report. The plan repo doctrine owns that
keying under its shared implementation forms. The report opening names the
judged repos and each repo's short HEAD at audit time. Its filename follows the
shared round protocol. Each round record's subject carries the round's
scope through the shared `impl-audit-<step scope>` form, with the scope `<n>`,
`<a>-<b>` or `all`, and its capability tag names the assistant that audited; the
plan repo owns that form and no `Audit:` body line repeats it. Each accepted
code finding bullet opens with its uppercase tier and
the finding's metadata tokens,
`- [C] [area:<primary-id>] [growth:<labels>] [reach:<value>] [complexity:<value>]
<prose>`, so a later round can read the round's findings, their suspected
growth patterns and their reach and complexity ratings from the log alone.
The fix workflow at `.agents/skills/fix/references/workflow.md` owns that
format, the audit workflow at `.agents/skills/audit/references/workflow.md`
owns the tokens' meaning, and the patterns and their numbering live in
`../plan/GROWTH-PATTERNS.md`.

A plan-text finding deferred from a Repo Edu-only round stays in that Repo Edu
round commit. Its bullet starts with its tier and plan location before the
shared finding tokens:
`- [B] [plan:../plan/<topic>.md#<heading>] [growth:<labels>] [reach:<value>]
[complexity:<value>] <prose>`. Deferral is only for work nobody directed. When
the user directs a plan-file fix during the round, the same run applies it and
lands it as an independent plan-repo commit in the ordinary plan-round form.
No repo-local action automatically requires or waits on the other commit.

## Commit Capability Tag

Every commit subject carries a three-character tag naming what produced it: the
assistant, the strength and the effort, one letter each.

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

The tag opens the subject, after the plan form when the subject has one, as
`abx c1d1 fix(audit-round): align the recorder result`. Its place in every
subject class is fixed by
[the subject grammar](.agents/references/subject-grammar.md).

The tag names the assistant whose work the subject reports. On an
automated planning or implementation-audit record that is the audit, not the session that wrote the
commit: Codex fixes whoever audited, so a writer's tag would say the same thing
on every record, while the auditor is what the trajectory reads off a clean one.
The role token right before the tag says which kind of subject it is, and a
reader needs that token anyway for the scope and the severity.

The session writes the tag, since it is the one that knows what it runs on. A
round's fix writes the auditor's letter alone and the commit hook, this repo's
`.husky/commit-msg` or the plan repo's `hooks/commit-msg`, widens it into the
whole tag, because the round holds the capability the fix session cannot see.

## Commit Model Record

Every commit body opens with the model the work ran on, so the log says what
produced a change without spending subject width on it.

A commit no round produced opens with one line, the model and the reasoning
effort:

```text
claude-opus-5 xhigh
```

A commit an automated planning or implementation-audit round lands opens with one line per model,
each naming the phases that ran on it:

```text
audit, rebut, fix: gpt-6-astra medium
vet: claude-opus-5 xhigh
```

The phases listed are the four that carry out a round: audit, vet, rebut and
fix. The brief, the two ruling passes and the watch write documents rather than
landing work, so they stay out. Phases keep round order inside a line, lines
keep the order of their first phase, and two phases share a line when their
model and their effort both match.

The model is the one the CLI reported running, never the one the round asked
for: `claude-opus-5`, not `opus`. An alias names whichever release is current,
so it would stop being true of the commit it sits in. The effort is one of
`low`, `medium`, `high` and `xhigh`.

`audit-round` passes the record to the phase that commits, because it holds
every phase's reported model and that session does not. A session committing on
its own writes its own line: it knows the model it was told to run and reads its
effort from the environment.

Repo Edu's `.husky/commit-msg` and the plan repo's `hooks/commit-msg` write the
record when a round supplies it. Each hook refuses any commit whose body does
not open with a model record. It checks the line's shape rather than a list of
model names, so a new model family needs no edit here. It also refuses a
single-model record whose effort disagrees with the subject's tag.

## Vocabulary

These are this repository's code and domain terms, and they may be used bare. A
word not listed here or in the home policy's planning vocabulary is expanded
where it is used. A word enters this list only when both admission tests pass:
its plain expansion reads worse at every use, and it is met often enough in what
the user reads to be learned rather than looked up. Each entry teaches the term
in plain words rather than pointing at an external reference, because the reader
is not assumed to know the source ecosystem's jargon.

- **admission**: the check run at the moment a result or record arrives that
  decides whether it is allowed to land, into session state or into the archive.
- **body**: the function a queued session command runs when its turn comes; it
  awaits its host work and commits its result before the next body starts.
- **bootstrap**: the session's startup sequence: load settings, fill the stores,
  start the workers, show the first surface. It can fail and be retried.
- **commit**: the final step that makes a result count by writing it into the
  session's official state; only queued bodies may commit.
- **course data**: the content of one course: its name, student and team roster,
  LMS link, repository template and clone settings, analysis settings and
  revision number. Saved and loaded only as one whole course, never in parts.
- **course database**: the one shared file holding every course at rest; the
  only saved home of course data. Settings, window state and the examination
  archive live elsewhere.
- **disposal**: the synchronous, terminal teardown of a session; late results
  land nowhere and a queued body that has not started never runs.
- **drop**: the task modifier that refuses a new start while one is still
  running, so the running work always reaches its own end. The app runs it at
  the input layer: while a command is admitted the capture gate swallows every
  event except that command's Cancel, so the second start never happens.
- **enqueue**: the task modifier that makes a new start wait for the running one
  and then take its turn. It is the dangerous one for anything a person
  clicked, because the click is held invisibly and replays against a screen
  that has moved on; work that uses it has to show the wait or refuse the
  input.
- **hydrate**: fill in-memory stores from data persisted on disk, typically
  during bootstrap.
- **keep-latest**: the task modifier that lets the running work finish, holds
  only the most recent start that arrived meanwhile and drops the ones before
  it. Listed for completeness: it is the one modifier the app does not use.
- **reducer**: a function that takes the current state and one event and returns
  the next state; the only place session state is allowed to change.
- **restartable**: the task modifier that stops the running work when a new
  start arrives and runs the new one instead. It is safe only where a later
  start reaches the same state cheaply, as the repository analysis pass does,
  because every finished repository already sits in the Query cache.
- **row**: one entry in a database, like one line in a table. In the course
  database each row is one complete course: all its course data in one entry,
  replaced whole on every save.
- **session**: the renderer's live working context from startup to teardown:
  loaded settings, courses, the active surface, the stores and the workers
  persisting them.
- **surface**: the main content view the session has active, a course view or
  home; changing it is a surface transition.
- **task modifier**: which of restartable, enqueue, drop and keep-latest a piece
  of work uses when a second start arrives while the first is still running. It
  belongs to the work and is declared once, never chosen per button. Naming work
  by who asked for it instead, as `user-asked` and `background` did, invites a
  start control to claim a modifier of its own, and that is how one analysis
  pass came to hold two. The four names are the standard ones, so they can be
  looked up outside this repo: RxJS spells them `switchMap`, `concatMap`,
  `exhaustMap` and `mergeMap`, Ember Concurrency uses these four, Redux-Saga
  uses `takeLatest`, `takeEvery` and `takeLeading`.
- **worker**: a long-lived background helper that writes changes to disk on its
  own schedule; it reports status but may not commit session state.

## Testing Strategy

Tests are functional/behavioral — they verify *what* the code must do, not *how*
it's structured internally. Prefer tests at package boundaries:

- domain invariants in `packages/domain/src/__tests__`
- workflow behavior in `packages/application/src/__tests__`
- adapter/port tests in integration and host packages
- desktop bridge checks in `apps/desktop/scripts` + tests
- CLI golden/behavior tests in `apps/cli/src/__tests__`
