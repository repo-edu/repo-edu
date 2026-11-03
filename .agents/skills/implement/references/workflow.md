---
reads:
  - oversized-step.md
  - ../../fix/references/ruling.md
  - ../../../../../plan/GROWTH-PATTERNS.md
  - ../../../../../plan/BOUNDARIES.md
---

# Plan-step implementation workflow

The phase arguments are exactly:

1. the absolute plan path
2. the one-based step number
3. the remaining hosting repo shares, in plan grammar order
4. the resolved model release this worker runs
5. the launched effort this worker runs

The runner has already passed the ready gate, parsed the step list, scanned
both Git histories and selected the plan's assigned coder. Implement only the
named step and remaining shares. Do not coordinate another worker, scan for
other steps or write an `implemented` marker. The runner owns those duties.

## Scope

Read the plan end to end from the supplied path. Read the `CLAUDE.md` of every
repo whose remaining share changes and every applicable nested `CLAUDE.md`.
The supplied growth patterns and boundaries are checks, not sources of work.
Derive no requirement from boundary text. When the step would cross a current
boundary, name it and stop for the user's ruling.

Before choosing an implementation mechanism or editing files, classify the
change under the repository's Patch, Local and Redesign rules. For every
feature file to be patched, list its current state surface and target count as
that rule requires. Resolve any build-versus-buy decision the repository rules
require before implementation.

Intermediate steps may leave behaviour broken until later plan steps land. Do
not add a compatibility layer or workaround for work the plan deliberately
orders later.

## Work

Implement the assigned step directly. Do not delegate another implementer.
Preserve unrelated work in both checkouts. The runner's invocation grants this
step's remaining repo shares and one commit for each after its checks pass. It
grants no work outside the step.

Resolve routine choices and overlaps from the full plan and current code. Ask
only for a missing product decision or required authorisation. When a ruling is
required, write the final ruling at the separately supplied ruling output path,
follow the supplied ruling reference and return `needs-ruling`. The runner
displays it and resumes this same session with the user's reply. The resumed
arguments carry no time value; keep the clock readings already held by this
session.

When the step cannot complete inside one context window and cannot be split
into independently complete parts, follow the supplied oversized-step rules.

Where code proves the plan wrong, implement what is right and record the reason
in the step commit body. Check any deviation against the supplied boundaries.
A departure that would cross one stops for the user instead of landing. Change
the plan file only when the user directs it; that directed fix lands as its own
plan-repo step commit in this worker.

## Verification and commits

After each repo share is complete, run the step's named checks and that repo's
required verification. Run each check once at the repository workflow's batch
point. Never start a development server, preview or production build.

Commit exactly one independent share in each assigned hosting repo. A step
hosted in both repos never combines the repos. Use the shared step subject:

```text
<stem>/impl-<n> <tag> <kind>(<scope>): <subject>
```

The conventional postfix omits an ordinary commit's leading severity
sequence. Use the model release and launched effort from the phase arguments
for the capability tag and the opening step-only record:

```text
<reported-model> <launched-effort>
Implementation took <active-minutes> min.
```

Read the clock when the turn starts, after each check run, just before each
commit and just before the turn ends. Active time is the sum of the spans
between readings within turns, rounded to the nearest whole minute. A wait for
a ruling, recovery session or later message sits between turns and is not
counted. When a failure ends a turn, the last reading is its boundary. The
reading after a check bounds work a later failure could otherwise leave out.
No session file supplies time.

For a step hosted in both repos, the first commit records active time since the
worker's first turn. Reset the accumulator at that commit. The second commit
records only active time after the first commit, so the records count the step
once when added.

Before finishing, verify that every assigned repo share has its step commit.
Report each commit SHA, checks and results, deviations and any unresolved
blocker. The runner checks Git rather than trusting this report.
