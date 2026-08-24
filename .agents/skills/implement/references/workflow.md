# Plan implementation workflow

Interpret the invocation arguments as a plan file and an optional
implementation-step range. The plan must be in the sibling `../plan` repo and
may be given as `<topic>.md` or `../plan/<topic>.md`. Interpret `3-5` as a
range and `4` as one step, counted against the plan's **Implementation plan**
numbering. No range means the earliest step not yet implemented. When no
plan is named, ask which plan to implement and wait.

Follow this repo's `CLAUDE.md` throughout. This workflow implements the plan
in this session, step by step. It is not the deterministic runner at
`tools/plan-implementation` and never invokes or imitates it: no
fresh-context-per-step machinery, no cursor commits. When the user wants
runner behaviour, they use the runner's own repository command.

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
say the plan may predate it and stop for the user's ruling. Then find the
steps already landed. Walk this repo's log for subjects using the topic's
joined stems and collect the step numbers from its `step-` and `steps-` forms.
The scope is the given range minus the landed steps. With no range it is
the earliest remaining step alone: the plan's **Execution and audits**
subsection requires a fresh-context session per step, and this session is
one context. A given range is the user's explicit batching and stands as
given, minus the landed steps. When no step remains, say the plan is fully
implemented and stop.

## Steps

Implement the scope in plan order, one step at a time. After each step, run
the step's named checks and the affected packages' verification per this
repo's `CLAUDE.md`. Then commit the step with the shared step form in
`../plan/CLAUDE.md` and the conventional postfix this repo requires. One step,
one commit; combine steps into one commit only when the plan says they land
together. The invocation that started this run grants each in-scope step's
commit once its checks pass.

Where the code proves the plan wrong, implement what is right and record the
reason in the step commit's body. A deviation leaves the plan that carried
the boundaries, so check it against `../plan/BOUNDARIES.md`; a departure that
would cross a boundary stops for the user instead of landing. When more than
one sensible fix exists, put the choice to the user and wait. Never write
plan-tier work into `../plan`. An implementation audit carries a plan-text
defect in its Repo Edu commit body for a later user-directed plan round.

## Close

When the run lands the plan's final step, run the plan's own final verification
steps when it names any. After the checkout is clean and the log proves every
step has landed, offer the shared completion marker from `../plan/CLAUDE.md` in
this repo and write it only on the user's word. A run that leaves steps
unimplemented ends with one line instead: the steps landed and the first step
remaining.
