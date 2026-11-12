---
title: pnpm audit-round ready
description: Assign a coder and mark a settled plan ready for implementation
---

`pnpm audit-round ready` is your call that a settled plan's implementation brief is complete: it
lands the ready marker and assigns the coder that every later implementation step and
implementation-audit fix runs on. A planning round after `ready` still fixes on the planning fixer.

| Fact | Detail |
| --- | --- |
| Runs in | A terminal at the Repo Edu or plan checkout root |
| Owners | `tools/audit-round/CLAUDE.md` and `tools/audit-round/src/lifecycle.ts` own the command; the plan doctrine at `../plan/CLAUDE.md` owns the ready marker |

## Usage

```text
pnpm audit-round ready <stem>        mark the named active settled plan ready
pnpm audit-round ready               mark the plan pnpm audit-round plan prints
pnpm audit-round ready -h | --help   show the command's help
```

## Behaviour

Run it after a detailing series ends with the runner's ready answer, or whenever you judge the brief
complete. The runner only reports what the fixed rules decide; this command makes the call. The full
run [`pnpm audit-round <stem>`](/repo-edu/tooling/full-plan-run/) makes the same call itself on a
ready answer.

Before it commits, the command reads the committed plan and checks the two forms the runner later
parses: the **Implementation plan** step list, where each step opens with a bold title and a hosting
sentence, and the one `Audit ranges:` sentence under **Execution and audits**, whose scopes must
cover the steps in order without gaps or overlap.

The coder comes from the ordered `coders` list in `tools/audit-round/settings.json`. The command
assigns the coder that follows the one recorded in the most recent ready marker, and starts again at
the first coder after the last, so plans take turns through the list. A one-entry list always
assigns that coder. An entry that says `default` is recorded as the model and effort `defaults`
named at that moment, so a later change to `defaults` leaves the assignment as it was. The command
reads settings but starts no assistant and resolves no model release; the implementation command
resolves the release when it starts.

## Output

The plan repo receives the empty `<stem>/ready: declare the plan ready for implementation` commit.
It carries no capability tag or model record, and its body names the assigned coder. The command
commits only the marker, so staged unrelated work in the plan checkout stays staged, and it prints
`Committed <sha>: <subject>`.

## Refuses when

The runner prints `audit-round: <reason>` and lands nothing.

1. **The plan is still widening.**
   `Cannot declare <stem>-widen.md ready while it is still widening.` Run
   [`pnpm audit-round settle`](/repo-edu/tooling/settle/) first.
2. **The plan already has a ready marker.** `<stem>.md already has ready marker <sha> <subject>.`
3. **The step list or audit ranges do not parse.** The message names the item or range that broke
   the form, such as a missing full stop after a bold title or a gap before a step.
4. **The plan file is not committed as it stands**, or no active plan has the stem.
5. **The `coders` list is empty.**
