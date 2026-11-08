---
title: pnpm audit-round plan
description: Print the active plan an omitted runner target would select
---

`pnpm audit-round plan` prints the active plan a command given no stem would take, so you can check
the choice before `round`, `settle`, `ready` or `close` acts on it.

| Fact | Detail |
| --- | --- |
| Runs in | A terminal at the Repo Edu or plan checkout root |
| Owners | `tools/audit-round/CLAUDE.md` and `tools/audit-round/src/default-target.ts` |

## Usage

```text
pnpm audit-round plan              print the absolute path of the selected plan
pnpm audit-round plan -h | --help  show the command's help
```

The command takes no argument or option.

## Behaviour

The runner merges both repos' commits that carry a plan stem, newest first by commit date, and takes
the first stem whose plan is still in `../plan/active/`. Stems without an active plan, such as
archived ones, are skipped. It does not read the plan's implementation steps, load settings or start
an assistant. The home `/brief-plan` and `/close` launchers use the same selection when you give
them no stem.

## Output

The absolute path of the selected plan, such as `/…/plan/active/<stem>.md`. Nothing is written.

## Refuses when

No active plan has a stem commit in either repo: `No active plan in the active folder has a stem
commit. Name one.` The command exits with status 2. Name the stem explicitly in the command you
meant to run.
