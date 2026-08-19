# Plan implementation workflow

Interpret the invocation arguments as a plan file and an optional
implementation-step range. The plan must be in the sibling `../plan` repo and
may be given as `plan-<topic>.md` or `../plan/plan-<topic>.md`. Interpret `3-5`
as a range and `4` as one step, counted against the plan's **Implementation
plan** numbering. No range means every step not yet implemented. When no plan
is named, ask which plan to implement and wait.

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
--oneline` filtered to subjects starting with `<file-stem>/`. The gate passes
on a standing `<file-stem>/ready:` marker, read by the plan repo's
recognition rule: a file-changing stem commit voids a standing `ready:`. When
the gate fails, name the newest stem commit, state that the plan is not ready
and stop. Continue only when the user explicitly says to.

## Scope

Read the plan end to end. Read `../plan/BOUNDARIES.md` beside it: boundaries
change only by user decision, so the current file can be newer than the plan.
This is a check, not a source of work. Derive no requirements from boundary
text. When an in-scope step would cross a current boundary, name the boundary,
say the plan may predate it and stop for the user's ruling. Then find the
steps already landed: walk this
repo's log for commits whose `Plan: <name>` first body line names this plan,
where `<name>` is the file stem with the `plan-` prefix dropped, and collect
their `Step:` lines. The scope is the given range minus the landed steps;
with no range it is every remaining step. When no step remains, say the plan
is fully implemented and stop.

## Sizing

On an unscoped invocation, size the scope from cheap evidence only: the
remaining step count and the files and packages the steps name. The risk
being sized is compaction, the harness summarising the conversation to free
context: every step should land whole in the context that read the plan.
When the whole scope can land in this session before compaction becomes a
real risk, say so in one line and start implementing in the same turn. Only
when it cannot does the session stop first: propose step ranges for separate
sessions and wait for the user's choice. Cut ranges where the plan's step
groups fall. Keep steps that share a package or an invariant in one range.
Never cut ranges into equal arithmetic parts. A given range skips the
sizing.

## Steps

Implement the scope in plan order, one step at a time. After each step, run
the step's named checks and the affected packages' verification per this
repo's `CLAUDE.md`. Then commit the step: severity prefix and conventional
kind per this repo's convention, body opening with `Plan: <name>` and then
`Step: <n>`. One step, one commit; combine steps into one commit only when
the plan says they land together. The invocation that started this run
grants each in-scope step's commit once its checks pass.

Where the code proves the plan wrong, implement what is right and record the
reason in the step commit's body. A deviation leaves the plan that carried
the boundaries, so check it against `../plan/BOUNDARIES.md`; a departure that
would cross a boundary stops for the user instead of landing. When more than
one sensible fix exists,
put the choice to the user and wait. Never write plan-tier work into
`../plan`: the audit rounds own plan corrections.

## Close

When the run lands the plan's final step, run the plan's own closing
verification steps when it names any. Then offer the
`<file-stem>/implemented:` marker in `../plan` and write it only on the
user's word, under the plan repo's marker convention: an empty commit whose
subject is `<file-stem>/implemented: <short restatement of the plan title>`
and whose body pins the episode here with two full-SHA lines,
`Repo-Edu-Anchor:` for the commit the first step commit built on and
`Repo-Edu-Head:` for the final step commit. A run that leaves steps
unimplemented closes with one line instead: the steps landed and the first
step remaining.
