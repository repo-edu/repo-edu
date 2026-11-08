---
title: /watch
description: Judge whether a plan and implementation episode is converging or drifting
---

`/watch` reads one episode's commit trail and round data and tells you whether repeated rounds are
settling the work or reopening the same concern, with a green, amber or red grade and a suggested
response.

| Fact | Detail |
| --- | --- |
| Runs in | Claude chat in the Repo Edu or plan checkout; `$watch` is the Codex counterpart |
| Owners | `.agents/skills/watch/references/workflow.md` owns the evidence, grades and response classes; `../plan/home/claude/commands/watch.md` and `../plan/home/agents/skills/watch/SKILL.md` launch it |

## Usage

```text
/watch                          watch the newest episode across both repos
/watch <stem>                   watch that plan's episode
/watch <commit>                 watch the episode that contains the commit
/watch help | -h | --help | ?   show the usage
```

A commit match wins over a stem match, and `HEAD` forms mean Repo Edu. Claude runs the watch in a
background subagent with a fresh context, so the chat stays free while it reads. An automatic
runner series also runs a watch after a round with findings when its glance says one is due; this
command is the hand-run route.

## What it shows you

The watch reads the joined plan and Repo Edu episode view through
`pnpm audit-round episode`, 200 lines at a time: commit subjects, finding tokens and reduced round
data. It opens named commits and the current plan or code only to ground a claim. It never reads
round transcripts, reports, vets, rebuttals or fix sessions, so its read stays independent of the
rounds it judges.

The grade summarises the trajectory:

1. **Green.** The episode converges: severity settles at C or below with no new A, and maintenance
   burden shrinks or grows by less each time. The watch shows only the grade and the response.
2. **Amber.** A warning sign is forming in one area, such as a repeated top severity or a new kind
   of issue. The watch describes the unstable part and its cause, then names the area to watch and
   when to look again.
3. **Red.** The warning sign is conclusive, such as the same top severity across many rounds in one
   area. The watch describes the cause and asks you to act now. When a targeted fix plan fits, it
   says how certain it is and writes a seed for it: a name, scope and done-test.

## Your answers

The watch suggests one response class and you choose. It starts nothing itself and does not stop a
round already in flight.

1. **Continue.** Let the rounds run on.
2. **Start a targeted fix plan.** Open a small peer plan from the seed with an ordinary `init`.
3. **Redesign the shape, or delete an over-scoped section.** Take the plan back to its shape.
4. **Hold an unstable area.** Leave it until evidence arrives.
5. **Spin off a peer plan, or question the objective.** The last fits drift that survives repeated
   reframes.

## Afterwards

A hand-run watch leaves only its judgement in chat. It writes no watch file, cadence record, source
change or commit. On amber, run `/watch` again sooner; on green, you can skip a few rounds.
