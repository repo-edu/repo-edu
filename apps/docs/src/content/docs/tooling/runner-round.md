---
title: pnpm audit-round round
description: Run one audit round or series on a plan scope or commit set
---

Use `pnpm audit-round round` to run the audit, vet, rebuttal and fix sequence on one bounded target.

## How do I run it?

Run the command in a terminal from the Repo Edu or plan checkout.

```text
pnpm audit-round round <stem>                         audit the plan stage its history selects
pnpm audit-round round <stem> plan                    audit the plan after implementation starts
pnpm audit-round round <stem> <step-or-range>         audit implemented steps
pnpm audit-round round <stem> 2,3-5                   audit several scopes in order
pnpm audit-round round <commit-or-range> [...]        audit commits outside a plan
pnpm audit-round round                                use the newest active plan
pnpm audit-round round <target> --first <selection>   choose the automatic-series opener
pnpm audit-round round <target> --auditor <list>      run the named manual series
pnpm audit-round round <target> --no-watch            skip the trajectory glance and watch
pnpm audit-round round <target> -v                    show assistant tool calls
```

Prefix a plan-repository commit with `plan@`. Auditor selections are `claude`, `codex` or capability
tags such as `atx`; quote a list that contains spaces. `--first` and `--auditor` cannot be combined.

## When do I use it?

Use this command when you want to audit one plan scope or commit set without granting later plan
stages. With no `--auditor`, a fresh judge may continue the automatic series with another configured
auditor. Use `--auditor` when you want a fixed sequence that you can edit between rounds.

## What does it read?

For a plan target, the runner reads the active plan, both repositories' stem history, current round
data and `tools/audit-round/settings.json`. For a commit target, it resolves the exact commits
against each repository's starting head. Each phase also reads the sources named by its workflow.

## Where does it stop and what do I type?

1. **A fix needs a ruling.** Read the displayed choice, type your answer and submit a blank line.
   The same fix session resumes.
2. **A phase fails.** Correct the named external problem, then run the exact recovery command the
   runner prints.
3. **A watch grades the episode red.** Read the watch and act on its structural concern before
   starting another round.
4. **The judge ends the series.** Type nothing. Its reason says whether the plan may settle, become
   ready or needs no further auditor on this target.

## What does it leave behind?

Each round leaves a claim, transcript and log under `../plan/active/`. Reports and review twins stay
there until a finished fix records their outcome. A plan target updates `<stem>-plan-rounds.json` or
`<stem>-impl-rounds.json`; a commit target updates `<commit-label>-rounds.json`. A due watch adds a
`-watch.md` file. A manual series temporarily uses `<target>-queue.md` and removes it when the
series ends.

## What owns this page?

`tools/audit-round/CLAUDE.md` and `tools/audit-round/src/command.ts` own this command; the workflows
under `.agents/skills/` own the individual phases.
