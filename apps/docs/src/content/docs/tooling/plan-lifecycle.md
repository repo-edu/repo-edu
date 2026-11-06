---
title: Plan lifecycle
description: Follow one plan from its first open shape through implementation audits and close
---

A plan stays in one file while it widens, settles, gains implementation detail and is carried into
the archive after the code is finished.

## Which stages does a plan pass through?

| Stage | What changes | What ends the stage |
| --- | --- | --- |
| Widen | Audits challenge the problem, scope and load-bearing decisions while the filename ends in `-widen.md` | You run `pnpm audit-round settle [stem]` or grant settle through the bare full-plan run |
| Settle | The runner renames the committed plan onto `<stem>.md` and records the phase marker | The rename commit lands |
| Detail | Audits complete the decisions, implementation steps and checks | You run `pnpm audit-round ready [stem]` or grant ready through the bare full-plan run |
| Ready | The runner records the assigned coder without starting implementation | The ready marker lands |
| Implement | One fresh worker implements and commits each remaining step share in order | Every hosting repository has every step share and a current `implemented` marker |
| Audit implementation | Series inspect the plan's listed audit ranges, then the full step range | The series judge stops on settled code and the user accepts that state |
| Close | The plan and retained round data move from `active/` into an archive folder | Each hosting repository and the plan repository carry their closing record |

## What stays the same across the stages?

The stem is the plan's identity. It is the filename without `.md` or `-widen`, and it ties the plan,
step commits, audit targets and closing records together. Widening and detailing use the same plan
body, so no transfer document sits between shape decisions and implementation detail.

The plan's product constraints and settled decisions continue to govern later stages. A later audit
may correct a decision when new correctness or quality evidence proves it wrong, but it records why
the direction changed.

## Which calls belong to the user?

You decide when to settle the shape, declare the plan ready and close the loop. The individual
commands record those calls without starting an assistant:

```text
pnpm audit-round settle [stem]
pnpm audit-round ready [stem]
pnpm audit-round close [stem]
```

Running `pnpm audit-round <stem>` grants all three calls in advance. It still stops when a ruling,
failure, red watch or open close decision needs you.

## How do implementation and audits fit together?

The plan's first ordered list under **Implementation plan** defines the steps and their hosting
repositories. The fixed `Audit ranges:` sentence defines the implementation scopes to inspect.
Implementation starts one fresh worker per pending step and never combines the commits of two
hosting repositories.

After the shares and markers land, the runner audits each listed range in order and then the full
range. Audit reports judge shipped code first: a correct departure from the plan is recorded as a
departure, while defective code remains a finding even when it followed the plan exactly.

## Where can I see the current stage?

The active filename and Git history are the state:

1. `active/<stem>-widen.md` means widening.
2. `active/<stem>.md` without a ready marker means detailing.
3. A `ready` marker followed by missing step shares means implementation.
4. Current `implemented` markers mean the plan is ready for its implementation audit ranges.
5. A plan under `archive/<name>/` is closed and no longer a round target.

`pnpm audit-round plan` prints the active plan selected when a command omits its stem. It writes
nothing.

## What owns this page?

The plan repository's `CLAUDE.md` sections **Artifact lifecycle**, **Ready marker** and **Shared
implementation forms** own this page; the loop-close workflow owns archival.
