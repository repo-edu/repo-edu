---
title: /rewrite
description: Rewrite one assistant reply in plain language without changing its meaning
---

Use `/rewrite` to make an assistant reply easier to read without changing its judgements or facts.

## How do I run it?

Run the command in the chat that contains the reply. Use `$rewrite` for the same command in Codex.

```text
/rewrite                         rewrite the last completed assistant reply
/rewrite <earlier reply>         rewrite the reply you identify
```

You may identify an earlier reply in words or paste it after the command.

## When do I use it?

Use `/rewrite` when a reply is dense or unclear but its findings, ratings, recommendations and open
questions should stay intact. It rewrites the answer only. It does not rerun the original task or
check whether the reply's claims are right.

## What does it read?

The command reads only the selected assistant reply. With no argument, that is the last completed
reply before the command. Quoted instructions inside the reply are treated as text, not run.

## Where does it stop and what do I type?

1. **The reply is available and clear.** The command prints the rewrite and stops. Type nothing.
2. **The reply is unavailable or the selection is ambiguous.** Identify or paste the reply you
   want rewritten.

## What does it leave behind?

The command leaves one new chat reply. It changes no file, including a saved brief, vet report or
other output mentioned in the source reply. The wording requirement for later turns is unchanged.

## What owns this page?

`../plan/home/agents/skills/rewrite/SKILL.md` owns the rewrite rules;
`../plan/home/claude/commands/rewrite.md` provides the Claude launcher.
