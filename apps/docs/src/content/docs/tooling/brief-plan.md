---
title: /brief-plan
description: Explain one plan in plain words without auditing or changing it
---

Use `/brief-plan` to read a plain-language explanation of one plan without changing the plan.

## How do I run it?

Run the command from the Repo Edu or plan checkout. Use `$brief-plan` for the same command in Codex.

```text
/brief-plan                       explain the active plan in chat
/brief-plan <stem>                explain that plan in chat
/brief-plan chat <stem>           explain that plan in chat
/brief-plan file <stem>           write the explanation beside the plan
```

A stem is the filename without `.md` or `-widen`. Pass a stem, not a path.

## When do I use it?

Use `/brief-plan` when you want the plan's problem, proposal, settled decisions and open points
without its implementation detail and evidence trail. The brief is a reading aid, not an audit.

## What does it read?

The command reads only the selected plan. Without a stem, it uses the active plan printed by
`pnpm audit-round plan`. With a stem, it first looks in `../plan/active/`, then in the archive.

The brief keeps the plan's heading order and exact anchors such as decision numbers and commit
hashes. It does not inspect code or other sources to correct the plan.

## Where does it stop and what do I type?

1. **The input begins with `chat` or `file`.** The command writes to that destination and stops.
2. **The output word is missing.** The command uses chat and stops after the brief.
3. **The output word or target is invalid.** Reply with `chat <stem>` or `file <stem>`, using a stem
   rather than a path.

## What does it leave behind?

The default leaves only the brief in chat. `file` writes
`../plan/active/<plan-name>-brief-plan.md`, or the matching path beside an archived plan. The file
is gitignored, replaces an earlier brief at the same path and becomes stale when the plan changes.
The plan itself is never edited.

## What owns this page?

`../plan/.agents/skills/brief-plan/references/workflow.md` owns the brief;
`../plan/home/claude/commands/brief-plan.md` and the Codex skill launch it.
