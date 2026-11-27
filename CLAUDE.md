# CLAUDE.md

Read the [app glossary](glossaries/app.md) first for terms used across Repo Edu.

## Planning

Keep plans and design documents in the sibling `../plan` repository. The
[tooling design document](../plan/notes/tooling-design.md) explains the planning and audit tools'
structure and reasons. The [tooling user guide](apps/docs/src/content/docs/tooling/index.md)
explains their commands, loops and user decisions. Keep both in sync under
[Tooling mirrors](.agents/references/round-protocol.md#tooling-mirrors).

Attribute each touched tracked source file to its primary area ID in
`tools/architecture-check/src/area-model.json`. Cover IDs give cross-cutting context.
Before adding a tracked file under `apps/*/src`, `packages/*/src` or `tools/*/src`, assign
it to a primary area. Add one in the same change if none owns it. Before splitting a
tracked source file, name its current primary area ID and the child area ID for each
output. If the split creates a new primary concern, update the model and record `splitFrom`.

The user never reads or edits machine artifacts such as the area model, ledgers or generated
files. Their upkeep or readability cannot justify a feature or proposal.
Follow [History reads](.agents/references/round-protocol.md#history-reads) for audits and reviews.
Rule text, including `CLAUDE.md`, states each decision and its reason. Its origin belongs in Git
under [Mechanism cases](.agents/references/round-protocol.md#mechanism-cases).

Use the statement move tool for top-level statements so TypeScript's **Move to file**
refactor repairs imports. See the [tool documentation](tools/statement-move/CLAUDE.md) for
checks and refusals.

1. Move complete top-level statements with
   `pnpm move-statements <source> <start-line> <end-line> <target>`. Run one command per target
   using the line numbers left by the previous move.
2. In a test file, move shared helpers into a module with no tests first, then move the tests.
   Importing a test file runs its tests again.
3. Move nested code and refused moves by hand. Repoint other packages' imports by hand too.
   The tool loads only the source package's project.
4. Run `pnpm check` after the move batch. The move proves TypeScript 6 only. The check runs
   TypeScript 7 and Biome restores the layout lost in the refactor.

## Build and Development Commands

Use pnpm scripts only. Run validation from the workspace root.

| Command | Purpose |
| --- | --- |
| `pnpm fmt` | Format Markdown with rumdl |
| `pnpm fix` | Apply Markdown and Biome fixes |
| `pnpm check` | Run fix, typecheck, build:types, check:fixtures and check:architecture |
| `pnpm test` | Run workspace tests. The default Windows run excludes the macOS and Linux audit runner |
| `pnpm test tools/audit-round` | Run one package's tests by workspace-relative path |
| `pnpm file-sizes` | Show options for tree-style line and file counts by subfolder |

Run `fix` to finish a small change or `check` for a large one. Run the tests yourself when the plan
requires them or tested behaviour changes. The user runs `dev`, `preview` and `build`. After a
dependency manifest changes, announce and run `pnpm install` yourself. A cold install can be
silent for a long time. Let it finish and commit only lockfiles written by the package manager.

From either checkout, `pnpm audit-round round example 3` audits a plan step. See
[commands](tools/audit-round/references/commands.md) for options, settings and outcomes,
[round files](tools/audit-round/references/targets-and-files.md#round-files) for filenames and
[phase routing](tools/audit-round/CLAUDE.md#phase-routing) for argument order.

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
    ├── statement-move/            # TypeScript Move to file refactor (pnpm move-statements)
    └── sweep/                     # Source-growth triage (pnpm sweep)
```

After adding, removing or moving a `CLAUDE.md`, run
`node scripts/claude2assistants.mjs` to refresh the gitignored `AGENTS.md`
symlinks other assistants read. Content edits need no run; the symlinks serve
current content by construction.

Read the local `CLAUDE.md` before changing an app, package, tool or nested area, including
[analysis workflows](packages/application/src/analysis-workflows/CLAUDE.md).

Core flow:

1. `packages/renderer-app` exposes a session operation gateway. Its owner alone
   holds the raw `WorkflowClient` and orders complete session-changing bodies.
2. `apps/desktop` validates every renderer entry through one gateway. Ordinary
   workflows use its desktop-owned tRPC adapter; exclusive commands and clean
   close use request ports. `apps/cli` runs workflows in-process.
3. `packages/application` orchestrates use-cases using ports/contracts.
4. `packages/domain` owns pure semantics and invariants.

## Critical Rules

- Only the desktop entry gateway registers renderer IPC. It validates the current document and
  complete input before host admission, ordinary tRPC dispatch or request-port execution.
- The host admission reducer owns command preparation, execution, settlement, close and terminal
  failure. The renderer session operation owner freezes semantic changes from reservation through
  retirement.
- `composeCourseCommandTransition` supplies the complete next course for each course-changing
  command. Durable save and renderer application consume it with its host stamp. Features never
  merge partial command results.
- One desktop process owns one renderer document. Normal shutdown asks the child-process
  controller to end owned work. Confirmation expiry warns and exits without starting an updater.
  An uncaught main-process exception logs synchronously and exits immediately. Only process exit
  releases the program gate.
- Keep Node built-ins out of the desktop renderer runtime closure and the independently
  browser-safe roots (`renderer-host-contract`, `integrations-llm-contract`,
  `host-runtime-contract` and `test-fixtures`). The application package runs in Node.
- Keep side effects in adapters and ports, including `host-node` and integration adapters. Domain
  logic stays pure.
- Before product work, the desktop and compiled CLI claim the same program gate at the resolved
  app-data root. Hold it until no more product work can run. `host-node` owns the gate and root
  resolution.
- Packaged Windows child processes need a fixed launcher entry, explicit Electron `runAsNode`,
  job assignment before target command acceptance, a saved same-turn process identity and a
  non-inherited job handle.
- The child-process lifetime controller alone decides the terminal outcome for Git, subscription
  Claude, app Codex and plan-step Codex runs. Callers report result, proving-connection and
  cancellation facts. They never rank or compose failures. A reported-proof process needs no
  separate work-start fact.
- Every outside-program outcome requires confirmation that the whole owned tree has gone, except
  confirmation-expiry unknown. Forced-stop confirmation has a five-second deadline. On expiry,
  send one diagnostic and one user warning. An active run releases its local streams, returns
  unknown and leaves the session running. At shutdown, warn and exit. On Windows keep the
  unconfirmed tree's job handle open until process exit.
- Release validation proves the program gate in the packaged desktop and compiled CLI.
  Packaged Windows validation also proves the child-process lifetime contract.
- Never introduce legacy settings or profile migration.
- Each editable document has one in-memory owner. The renderer session owns preferences and
  credentials. The course Zustand store owns the active course. Only Load brings disk state
  into memory. Save workflows write to disk and report success or failure. Save handlers may
  return only server-stamped fields the owner cannot compute, such as a revision counter.

## Dependency Currency

Follow the [dependency currency rules](.agents/references/dependency-currency.md) for Renovate,
local updates, dependency selection, license evidence and desktop runtime externals.

## Implementation Review Findings

When asked to review implementation code, prefix every finding title with an implementation severity
tier. Use the [implementation tiers](.agents/references/round-protocol.md#implementation-tiers) in
the shared round protocol.

Number findings in report order. Use the shared protocol's
[Finding explanations](.agents/references/round-protocol.md#finding-explanations)
for their substance.

## Commit Severity Prefix

Omit routine check and test results. Grade each concern in a file-changing commit under the
[severity sequence](.agents/references/round-protocol.md#severity-sequence), except a plan step
or a split commit carrying out a chosen move list. The
[subject grammar](.agents/references/subject-grammar.md) owns the mark order and the closed list
of conventional kinds. Where required, the kind and scope immediately precede the sentence.

[Shared implementation forms](.agents/references/round-protocol.md#shared-implementation-forms)
owns plan identity, step numbers, record placement, cross-repo deferrals and directed plan-file
fixes. Follow the [finding metadata](.agents/references/round-protocol.md#finding-metadata) and
the [fix workflow](.agents/skills/fix/references/workflow.md#records) for implementation-audit
records. A [commit audit](.agents/skills/audit/references/commit-scope.md#record) opens with its
series label. A file split's `design`, `choose` and `split` open with the source file's split label.
Other off-plan work uses a severity-prefixed conventional subject.

## Commit Capability Tag

Every subject carries a three-letter tag except `settle`, `ready`, `choose` and `disprove`.
Those forms record a user's call and run no assistant. The tag follows the plan, series or split
form when present, and otherwise opens the subject. Its letters identify:

1. Vendor. `a` names Claude, `o` names Codex and `g` names Gemini. The tag uses the initials of
   Anthropic, OpenAI and Google because Claude and Codex both start with C.
2. Model tier. `b` names the base tier, the default one below the top. `t` names the top tier and
   `u` a model listed on neither tier. The body names the release.
3. Effort. `l`, `m`, `h` and `x` mean low, medium, high and xhigh.

The three alphabets share no letter, so each letter can be read alone and digits stay available
for severity counts. For example, `otx` records Codex on the top tier at xhigh effort.

Attribute each tag to the assistant whose work the subject reports. A planning or implementation
audit credits the auditor even when another model fixes it. The auditor varies across the
trajectory while the fixer comes from one setting. A fix uses the full auditor tag from the
audit report filename. Outside a round the session supplies its own tag. The runner supplies a
standalone close its tag because that session cannot read its own effort.

## Commit Model Record

Every tagged commit body opens with the CLI-reported model release and effort, so the log records
the run without widening the subject. An alias can resolve to another release later.
The [model record grammar](.agents/references/subject-grammar.md#commit-model-record) gives the
single-model, step and round forms.

The runner supplies the committing phase with the round record because only the runner observed
every phase. A later implementation audit treats audit, vet and rebuttal time as the round's cost
on that scope. The watch writes a document and contributes no commit record. A standalone close
receives its one-line record. An implement worker receives its reported release and launched
effort and adds `Implementation took <n> min.` under the implementation workflow's active-time
and two-repo split rules. For a hand-run commit, read the current session's reported model and
effort with the lookup for [Claude](.agents/references/claude-desktop-settings.md),
[Codex](.agents/references/codex-desktop-settings.md) or
[Antigravity](.agents/references/antigravity-desktop-settings.md).

See the [commit hooks](tools/audit-round/references/commit-hooks.md) for the stamps and refusals
both repos apply, and
[Doctrine changes](../plan/.agents/references/planning-rules.md#doctrine-changes) for the route a
listed-file change takes.

## Vocabulary

Define each project term once, at the scope that owns it:

1. App-wide terms belong in [glossaries/app.md](glossaries/app.md).
2. Terms shared by several packages belong in a subject glossary named for a package family or
   domain the code already carries. These files are `glossaries/child-process-lifetime.md`,
   `glossaries/program-gate.md`, `glossaries/analysis.md` and `glossaries/audit-round.md`.
3. Package-only terms belong in **Vocabulary** in the package's `CLAUDE.md`, as bootstrap and
   hydrate do in `packages/renderer-app/CLAUDE.md`.

The home planning vocabulary keeps ownership of its terms. Plans, rounds and instructions
refer to definitions at their owner because copies drift. A package's opening sentence names
only the subject glossaries that govern it. Subject glossaries can govern doctrine outside a
package. `glossaries/audit-round.md` covers the shared references, both repos' phase workflows
and the plan doctrine. Every workflow with a `reads` header lists it. Before changing a rule
here or another root-level file that uses a glossary's terms, read that glossary.

Apply the two tests separately:

1. Give a term an entry when a fresh session could plausibly give the concept a different name
   or misread the word. Ordinary nouns such as course and roster need no entry. Add a qualifying
   term in the same change that introduces it. A name without a definition spreads through code
   and doctrine and takes a rename plan to repair. Audits follow
   [Coined names](.agents/references/round-protocol.md#coined-names).
2. Use a term bare in chat only if its plain expansion reads worse at every use and the user
   meets it often enough to learn it. Expand it otherwise, wherever it is defined.

Write each entry as a bold term and a short, plain explanation. Teach the concept or role without
relying on outside references or ecosystem jargon. Code identifiers go stale on a rename.

## Testing Strategy

Tests are functional/behavioral — they verify *what* the code must do, not *how*
it's structured internally. Prefer tests at package boundaries:

- domain invariants in `packages/domain/src/__tests__`
- workflow behavior in `packages/application/src/__tests__`
- adapter/port tests in integration and host packages
- desktop bridge checks in `apps/desktop/scripts` + tests
- CLI golden/behavior tests in `apps/cli/src/__tests__`
