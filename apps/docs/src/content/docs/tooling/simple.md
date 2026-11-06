---
title: /simple
description: Require plain, structured wording for a whole assistant session
---

Use `/simple` to make every later chat reply and file in the session use plain, structured wording.

## How do I run it?

Run the command in any Claude chat. Use `$simple` for the same command in Codex.

```text
/simple                 turn on the requirement and wait for the next message
/simple <prompt>        turn on the requirement and run that prompt
```

The wrapped prompt may be any task the assistant could normally perform.

## When do I use it?

Use `/simple` when the whole session should use words the reader already knows, short sentences and
lists for cases, duties, options or outcomes. The requirement applies to later messages too, not
only to the command's first reply.

## What does it read?

With a prompt, the command reads that prompt and runs it under the wording requirement. Without a
prompt, it reads no project file and waits for the next message.

Exact paths, commit hashes, names, numbers and code identifiers stay unchanged. Words admitted by
the repository vocabulary may still appear without an explanation.

## Where does it stop and what do I type?

1. **You supplied a prompt.** The assistant runs it immediately. Continue the conversation as
   normal; the requirement remains active.
2. **You supplied no prompt.** The assistant confirms the requirement in one line. Type the task
   you want to run next.

## What does it leave behind?

The command itself writes no file. It changes the wording of every later reply, report and file the
session writes. It does not create a setting that survives into another session.

## What owns this page?

`../plan/home/claude/commands/simple.md` owns the shared contract;
`../plan/home/agents/skills/simple/SKILL.md` provides the Codex launcher.
