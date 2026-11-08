---
title: pnpm audit-round settle
description: Record that a widening plan's shape is settled
---

`pnpm audit-round settle` is your call that a widening plan's shape is settled: it ends widening by
giving the plan its settled filename, so later rounds detail the brief instead of challenging its
shape.

| Fact | Detail |
| --- | --- |
| Runs in | A terminal at the Repo Edu or plan checkout root |
| Owners | `tools/audit-round/CLAUDE.md` and `tools/audit-round/src/lifecycle.ts` own the command; the plan doctrine at `../plan/CLAUDE.md` owns when a plan is ready to settle |

## Usage

```text
pnpm audit-round settle <stem>        settle the named active widening plan
pnpm audit-round settle               settle the plan pnpm audit-round plan prints
pnpm audit-round settle -h | --help   show the command's help
```

## Behaviour

Run it after a widening series ends with the runner's settle answer, or whenever you judge that no
concrete shape question remains. The runner only reports what the fixed rules decide; this command
makes the call. The full run [`pnpm audit-round <stem>`](/repo-edu/tooling/full-plan-run/) makes the
same call itself on a settle answer.

The command renames `<stem>-widen.md` to `<stem>.md` in `../plan/active/` and commits only that
rename, with the plan checkout's normal hooks, so unrelated work in the plan checkout stays as it
was. It then claims the empty settle marker beside the plan's round files. It loads no settings and
starts no assistant.

## Output

1. **The commit** `<stem>/settle: settle the plan's shape` in the plan repo, which carries no
   capability tag or model record because no assistant ran.
2. **The marker** `../plan/active/<stem>-plan-audit-<round>-0-settle.md`, empty, numbered so a file
   list shows where the settle fell among the rounds.

It prints `Committed <sha>: <subject>` and `Marker: <path>`.

## Refuses when

The runner prints `audit-round: <reason>` and changes nothing.

1. **The plan is not widening.** `Cannot settle <stem>.md: the active plan is not at
   <stem>-widen.md.`
2. **The plan file is not committed as it stands.**
   `<file> is not committed as it stands: <untracked, staged changes or unstaged changes>.` Commit
   or discard the plan's changes and run the command again.
3. **No active plan has the stem**, or the stem is a path.
