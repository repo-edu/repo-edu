---
title: /watch
description: Judge whether a plan and implementation episode is converging or drifting
---

Use `/watch` to get a grounded green, amber or red judgement on one episode's trajectory.

## How do I run it?

Run the command from the Repo Edu or plan checkout. Use `$watch` for the same command in Codex.

```text
/watch                    watch the newest episode across both repositories
/watch <stem>             watch that plan episode
/watch <commit>           watch the episode containing that commit
/watch help               show usage
```

The help forms `-h`, `--help` and `?` also work. A commit match takes priority over a stem match.
`HEAD` forms mean Repo Edu.

## When do I use it?

Use `/watch` when you want to know whether repeated plan or implementation rounds are settling the
work or reopening the same concern. It suggests a response, but it does not decide or carry out that
response.

## What does it read?

The command reads the joined plan and Repo Edu episode view in 200-line pages. The view contains
the relevant commit subjects, finding tokens and reduced round records. It reads named commits and
the current plan or code only when a claim needs grounding.

It does not read round transcripts, audit reports, vet files, rebuttal files or fix sessions.

## Where does it stop and what do I type?

1. **The watch is green.** It reports convergence and suggests continuing. Type your decision or
   continue the work outside the command.
2. **The watch is amber.** It names the area and when to look again. Type whether to continue or
   take another suggested response.
3. **The watch is red.** It asks you to act now and gives the supported response, with a plan seed
   when a targeted fix plan fits. Type the response you choose; the watch itself starts nothing.
4. **You requested help.** The command prints usage and stops.

## What does it leave behind?

A hand-run watch leaves only its judgement in chat. It writes no watch file, cadence record, source
change or commit. Running it does not stop an audit already in progress or schedule another watch.

## What owns this page?

`.agents/skills/watch/references/workflow.md` owns the evidence, grades and response classes;
`../plan/home/claude/commands/watch.md` and the Codex skill launch it.
