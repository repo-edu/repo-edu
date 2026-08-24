# Plan implementation workflow

Interpret the invocation arguments as a plan file and an optional
implementation-step range. The plan must be in the sibling `../plan` repo and
may be given as `<topic>.md` or `../plan/<topic>.md`. Interpret `3-5` as a
range and `4` as one step, counted against the plan's **Implementation plan**
numbering. No range means the earliest step not yet implemented. When no
plan is named, ask which plan to implement and wait.

Follow the `CLAUDE.md` of every repo whose files the run changes. This workflow
implements the plan in this session, step by step.

Before any implementation work, check the named file is a plan. A
`topology-<topic>.md`, a `topology-<topic>-detail.md`, a `draft-<topic>.md`
or a `carry-<topic>.md` is a planning artifact and carries no implementation
steps. Name the file, say it cannot be implemented and stop.

## Ready gate

Before any implementation work, run the stem scan in `../plan`: `git log
--oneline` filtered to the topic's joined bare, `plan-<topic>` and
`topology-<topic>` subject stems. The gate passes when that scan contains a
`ready:` marker. It stands until loop-close. When the gate fails, name the
newest joined-stem commit, state that the plan is not ready and stop. Continue
only when the user explicitly says to.

## Scope

Read the plan end to end. Read `../plan/BOUNDARIES.md` beside it: boundaries
change only by user decision, so the current file can be newer than the plan.
This is a check, not a source of work. Derive no requirements from boundary
text. When an in-scope step would cross a current boundary, name the boundary,
say the plan may predate it and stop for the user's ruling.

Derive each candidate step's repo set from the files its plan text says to
change. A step may belong to Repo Edu, the plan repo or both. When the repo set
is unclear, stop for a plan correction. Treat the files a step changes in one
repo as that repo's share of the step. In each repo in the set, use `git log` to
find subjects under the topic's joined stems. Collect the step numbers from its
`step-` and `steps-` forms. A repo's share is landed only when that repo's log
carries the step form. A both-repo step remains until both shares have landed.

The scope is the given range minus the landed repo shares. With no range it is
every remaining share of the earliest unfinished step: the plan's **Execution
and audits** subsection requires a fresh-context session per step, and this
session is one context. A given range is the user's explicit batching and
stands as given, minus the landed shares. When no share remains, name the
completed range, or say the whole plan is fully implemented for an unscoped
run, and stop.

## Steps

Implement the scope in plan order, one step at a time, changing only its
remaining repo shares. After each share, run the step's named checks and that
repo's required verification. Commit the share in its repo with the shared
step form in `../plan/CLAUDE.md` and the conventional postfix that repo
requires. A both-repo step gets one independent commit in each repo. One step
gets at most one commit per repo; combine steps only when the plan says they
land together. The invocation that started this run grants each in-scope repo
share's commit once its checks pass.

Where the code proves the plan wrong, implement what is right and record the
reason in the step commit's body. A deviation leaves the plan that carried
the boundaries, so check it against `../plan/BOUNDARIES.md`; a departure that
would cross a boundary stops for the user instead of landing. When more than
one sensible fix exists, put the choice to the user and wait. Write plan-tier
work into `../plan` only when the user directs it; a directed plan-file fix
lands in the same run as its own plan-repo commit in the round form. An
implementation audit defers an undirected plan-text defect in its Repo Edu
commit body.

## Close

For each repo where the run lands its final hosted share, run the plan's final
verification when it names any for that repo. After that repo's checkout is
clean and its log proves every share it hosts has landed, offer its shared
`implemented:` marker from `../plan/CLAUDE.md` and write it only on the user's
word. A both-repo step counts in each repo only when that repo's commit has
landed. A run that leaves work unimplemented ends with one line per repo: the
shares landed and the first step remaining there.
