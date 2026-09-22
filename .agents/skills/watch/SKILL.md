---
name: watch
description: Write the trajectory watch file and cadence record for an unattended planning or plan-scoped implementation-audit round. Use when the runner invokes its watch phase with a watch file and cache root.
---

# Watch

This skill is a special case of the `simple` skill. Read
`~/.agents/skills/simple/SKILL.md` and apply its requirement to the whole
session. Skip its confirm-and-wait step: continue directly with the watch.

You are the first pass: write the draft. A fresh session rewrites it afterwards
through the watch edit, so write the watch as if it were final rather than
leaving notes for that pass.

The arguments name the watch file to write and the cache root holding its
cadence record. Read `references/workflow.md` completely and follow it.
