# CLAUDE.md

Read [`glossaries/audit-round.md`](../../glossaries/audit-round.md) first: it defines the words
of the rounds and of this runner.

This is the private planning and implementation-audit tool (`@repo-edu/audit-round`). Its
primary area is `tool-audit-round`. It targets macOS and Linux and has no product
consumers.

## Document layout

State each fact once in the section for the behaviour it describes. Link to that section wherever
else it is needed. Keeping detail in references means only sessions working on that subject
need to load it.

Before changing a file directly under `src/`, read the sections its row in the
[ownership table](references/ownership.md) names. Keep this as the only source-file map. Update
the section for the behaviour that changes and add a row only for a new file.

| Reference | Subject |
| --- | --- |
| [Ownership](references/ownership.md) | Source files, their responsibilities and the sections that describe them |
| [Targets and round files](references/targets-and-files.md) | Plan and commit targets, filenames, round data, stopped rounds and archiving |
| [Commands](references/commands.md) | Command grammar, settings, examples and per-command behaviour |
| [Rounds](references/rounds.md) | One round's phase sequence, its report results, the winner rule and a ruling's wait |
| [Series](references/series.md) | The automatic series and its fixed rules, scope lists, open deferrals and the manual queue |
| [Watch](references/watch.md) | The glance, the watch record and the episode evidence |
| [Sessions](references/sessions.md) | Who runs each phase, startup, prompts and one assistant invocation |
| [Commit hooks](references/commit-hooks.md) | The commit-message hook both repositories run |
| [Output](references/output.md) | The settings header, the status line, the log and the notices |
| [Model read-out](references/model-read-out.md) | The `models` command and its full-screen view |

## Plan targets

[Plan target resolution](references/targets-and-files.md#plan-targets) defines how a stem, a scope
or an omitted target selects an audit.

## Round files

See [Round files](references/targets-and-files.md#round-files) for filenames, allocation, round
data and step logs.

## Report lifecycle

[Report lifecycle](references/targets-and-files.md#report-lifecycle) covers evidence commits and
the moves after a close, completed commit series or split.

## Phase routing

Planning sessions work in the plan checkout. Implementation and commit sessions work in Repo Edu.
Claude receives the peer and evidence checkouts as additional directories. Recovery commands
restore the working directory. For workflow headers and the files `requests.ts` supplies whole,
see [Arguments and prompts](references/sessions.md#arguments-and-prompts).

`round-paths.ts` supplies the following arguments in order. File paths are absolute except for
the source paths specified relative to Repo Edu.

| Phase | Arguments in order |
| --- | --- |
| Design | Source path relative to Repo Edu, blob hash, designer entry's density |
| Pick | Source path relative to Repo Edu, current hash, answers in number order (each number, absolute answer path and any refusal) |
| Audit | Audit report output, then the target described below |
| Vet | Audit report input, this vetter's report output. A vetter sees no other vet report |
| Rebuttal | Audit report, all vet reports in panel order, rebuttal report output. Each answer names the finding number and vetter tag |
| Rule | Audit report, all vet reports in panel order, rebuttal report, ruler report output, findings object. Each C or D contest or split carries its audit tier. The input supplies the panel separately |
| Fix | Audit report, all vet reports, rebuttal report if present, ruler report if present, then the applicable deferral, contest and choice objects described below |
| Implement | Plan, one-based step number, remaining hosting repo shares, resolved model release, launched effort |
| Watch | No path arguments. The prompt supplies the evidence and the runner owns [both writes](references/watch.md#watch) |
| Close | Plan, capability tag, model record, open-deferral object, optional abort reason |

The audit takes a plan with its implementation scope and open-deferral object for an implementation
audit, a plan with the open-deferral object for a chained planning audit, or the plan alone for an
ordinary planning audit. A commit audit takes one object per group with `repository`, carried
`references`, `startingHead`, advancing exact `commits`, `originalCommits` and resolved
`shortReferences`.

A chained planning or plan-scoped implementation fix receives the same open-deferral object as its
audit. When there are contests or splits, the contest object carries every one with its winner and
reason, whether the ruler or user decided it. A choice object follows when the user gave a choice.
The runner asks before starting the fix under
[Reconciliation](../../.agents/references/round-protocol.md#reconciliation).
The fix child's `COMMIT_OPEN_CONTESTS` names finding numbers still missing a winner. An empty value
lifts the commit block.

Each unattended phase receives its result schema. The runner writes the audit, vet, rebuttal and
ruler reports from checked results to the output paths above. A report phase finishes only when
its output exists and is non-empty. The runner displays the report or closing note at phase end.
See [One invocation](references/sessions.md#one-invocation).

A fix or implement worker gets its ruling path separately and reuses it on resume. An implement
resume carries the user's reply after a ruling or the generic continuation after failure. Neither
supplies a time value.

## Invocation

Run from either checkout with authenticated `claude` and `codex` commands.
`context.ts` resolves the installed Repo Edu checkout and its siblings, independently of the
invoking directory or round kind. The plan checkout's `active/` holds plans and briefs.
Every command requires the sibling `plan-evidence` Git checkout and its `active/` round folder.
See the [command examples](references/commands.md#examples). The runner bundles
[terminal Markdown rendering](references/output.md#terminal-rendering), including colour.

On macOS, `main.ts` starts `caffeinate -i -w <runner pid>` before any command to keep an
unattended run awake after the display sleeps on battery. The hold ends when the runner exits.
A failed start warns once and the command continues. Linux takes no hold.

**Stopping.** Interrupt, hang-up and termination signals abort the run as `Interrupted`.
`cli-process.ts` cancels the child on those signals because a child sharing the terminal's
process group can exit successfully on them. The round stops its phase process, confirms it
has gone and records `interrupted`. Failed writes to standard output or error also abort the
run. Both streams need error listeners for the process lifetime so a closed terminal can still
leave the ending on disk. Killing the runner leaves no round entry.

**From a chat.** The ruling chat's Unix sockets require the bare commands
`pnpm audit-round ruling [target]` and `pnpm audit-round answer <target> <file>`
to run outside the chat sandbox.

- Claude Code needs `pnpm audit-round ruling`, `pnpm audit-round ruling *` and
  `pnpm audit-round answer *` in `sandbox.excludedCommands`. If they are missing, both commands
  fail with `EPERM`. Report the error, name the three entries and stop.
- Codex uses its command permissions. If the sandbox blocks the command, request permission for
  it. If refused, report the permission error and stop.

## Verification

Run `pnpm check` and `pnpm test` from the workspace root. The package uses Node's
test runner through `tsx`. Round tests use controlled assistant functions;
boundary tests use child processes and the recordings under
`src/__tests__/fixtures`. Ordinary tests make no live model calls.
