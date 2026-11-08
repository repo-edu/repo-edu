---
title: /brief-plan
description: Explain one plan in plain words without auditing or changing it
---

`/brief-plan` gives you a plain-words reading of one plan, its problem, proposal, settled decisions
and open points, when you want to understand it without reading its evidence trail.

| Fact | Detail |
| --- | --- |
| Runs in | Claude chat in the Repo Edu or plan checkout; `$brief-plan` is the Codex counterpart |
| Owners | `../plan/.agents/skills/brief-plan/references/workflow.md` owns the brief; `../plan/home/claude/commands/brief-plan.md` and `../plan/home/agents/skills/brief-plan/SKILL.md` launch it |

## Usage

```text
/brief-plan                       explain the active plan in chat
/brief-plan <stem>                explain that plan in chat
/brief-plan chat <stem>           explain that plan in chat
/brief-plan file <stem>           write the explanation beside the plan
```

A stem is the plan filename without `.md` or `-widen`; pass a stem, not a path. Without a stem the
command reads the plan `pnpm audit-round plan` prints. A stem is looked up in `../plan/active/`
first, then in the archive. The whole session uses the `/simple` wording requirement.

## What it shows you

The brief reads the selected plan and nothing else. Its one measure is how fast a reader who did not
write the plan understands it, so it is short where that helps and longer where a step needs
spelling out.

1. **One summary first.** It rewrites the plan's own summary, such as its **User summary**, or adds
   one when the plan has none.
2. **The plan's headings in the plan's order.** You can jump from the brief to the same place in the
   plan.
3. **Behaviour, not code.** It says what the app does and what the plan wants instead, without
   function or module names.
4. **Exact anchors.** Commit hashes, decision numbers, other plans and named documents stay exact.

The brief never adds a claim, settles an open question or reports a defect. A brief is a reading
aid, not an audit, and the plan stays the record.

## Early stops

1. **The word before the stem is not `chat` or `file`.** The command names the word and stops.
   Rerun with `chat <stem>` or `file <stem>`.
2. **A path was given.** The command shows the stem form and stops.

## Afterwards

1. **Chat**, the default, leaves only the brief as the whole reply.
2. **`file`** writes `<plan-name>-brief-plan.md` beside the plan, in `../plan/active/` or the
   archive folder, and replies with that path alone. The file is gitignored, replaces an earlier
   brief of the same plan and goes stale at the plan's next commit.

The plan itself is never edited.
