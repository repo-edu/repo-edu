---
title: Plan lifecycle
description: Follow one plan from its first open shape through implementation audits and close
---

A plan stays in one file while it widens, settles, gains implementation detail and is carried into
the archive after the code is finished, so every later stage works from the decisions the earlier
stages made.

| Fact | Detail |
| --- | --- |
| Owners | The plan repository's `CLAUDE.md` sections **Artifact lifecycle**, **Ready marker** and **Shared implementation forms**; `../plan/.agents/skills/close/references/workflow.md` owns archival |

## Why one file

The plan's phase is written in its filename, so a fresh assistant session knows whether the shape is
still open by reading the name, without chat memory or a search through Git history. The same body
carries the shape decisions and the implementation detail, so no transfer document sits between
them and nothing is lost in a conversion.

The stem is the plan's identity. It is the filename without `.md` or `-widen`, and it ties the
plan, step commits, audit targets and closing records together. It stays the same when the plan
settles or reopens.

The plan's product constraints and settled decisions continue to govern later stages. A later audit
may correct a decision when new correctness or quality evidence proves it wrong, but it records why
the direction changed. A reversal is cheapest while the shape is open, before detail stacks on top
of it.

## Stages

| Stage | What changes | What ends the stage |
| --- | --- | --- |
| Widen | Audits challenge the problem, scope and load-bearing decisions while the filename ends in `-widen.md` | You run [`pnpm audit-round settle [stem]`](/repo-edu/tooling/settle/) or grant settle through the [bare full-plan run](/repo-edu/tooling/full-plan-run/) |
| Settle | The runner renames the committed plan onto `<stem>.md` and records the phase marker | The rename commit lands |
| Detail | Audits complete the decisions, implementation steps and checks | You run [`pnpm audit-round ready [stem]`](/repo-edu/tooling/ready/) or grant ready through the bare full-plan run |
| Ready | The runner records the assigned coder without starting implementation | The ready marker lands |
| Implement | [One fresh worker](/repo-edu/tooling/implement/) implements and commits each remaining step share in order | Every hosting repository has every step share and a current `implemented` marker |
| Audit implementation | [Series](/repo-edu/tooling/runner-round/) inspect the plan's listed audit ranges, then the full step range | The fixed series rules stop after every available assistant has a current read and the user accepts that state |
| Close | [Loop-close](/repo-edu/tooling/runner-close/) moves the plan and retained round data from `active/` into an archive folder | Each hosting repository and the plan repository carry their closing record |

A detailing finding that undermines a settled decision may reopen the shape when you agree. The fix
that applies it renames the file back onto `<stem>-widen.md` and writes a reopen marker; a later
settle closes the shape again.

## Your calls

You decide when to settle the shape, declare the plan ready and close the loop. Each command records
its call without starting an assistant, except close, which starts the one close session:

```text
pnpm audit-round settle [stem]
pnpm audit-round ready [stem]
pnpm audit-round close [stem]
```

Running `pnpm audit-round <stem>` grants all three calls in advance. It still stops when a ruling,
failure, red watch or open close decision needs you. Run the stage commands instead when you want to
read the plan between stages.

## Steps and audit ranges

The plan's first ordered list under **Implementation plan** defines the steps and their hosting
repositories. The fixed `Audit ranges:` sentence defines the implementation scopes to inspect.
Implementation starts one fresh worker per pending step and never combines the commits of two
hosting repositories.

After the shares and markers land, the runner audits each listed range in order and then the full
range. Audit reports judge shipped code first: a correct departure from the plan is recorded as a
departure, while defective code remains a finding even when it followed the plan exactly.

## Reading the stage

The active filename and Git history are the state:

1. `active/<stem>-widen.md` means widening.
2. `active/<stem>.md` without a ready marker means detailing.
3. A `ready` marker followed by missing step shares means implementation.
4. Current `implemented` markers mean the plan is ready for its implementation audit ranges.
5. A plan under `archive/<name>/` is closed and no longer a round target.

[`pnpm audit-round plan`](/repo-edu/tooling/plan/) prints the active plan selected when a command
omits its stem. It writes nothing.
