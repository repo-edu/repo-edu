# Plan implementation workflow

Interpret the invocation arguments as a plan file and an optional
implementation-step range. The plan must be in the sibling `../plan` repo and
may be given as `<topic>.md` or `../plan/<topic>.md`. Interpret `3-5` as a
range and `4` as one step, counted against the plan's **Implementation plan**
numbering. No range means the earliest step not yet implemented. When no
plan is named, ask which plan to implement and wait.

Follow the `CLAUDE.md` of every repo whose files the run changes. The invoking
chat coordinates the run. It delegates each step to a fresh sub-agent and
waits for that step to land before starting the next. An assigned worker
implements its one step directly; it does not delegate another implementer.

Before any implementation work, check the named file is a plan. A
`topology-<topic>.md`, a `topology-<topic>-detail.md`
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

Before choosing implementation mechanisms or editing files, read
`../plan/GROWTH-PATTERNS.md` completely.

Read the plan end to end. Read `../plan/BOUNDARIES.md` beside it: boundaries
change only by user decision, so the current file can be newer than the plan.
This is a check, not a source of work. Derive no requirements from boundary
text. When an in-scope step would cross a current boundary, name the boundary,
say the plan may predate it and stop for the user's ruling.

Derive each candidate step's repo set from the files its plan text says to
change. A step may belong to Repo Edu, the plan repo or both. Treat the files a
step changes in one repo as that repo's share of the step. In each repo in the
set, use `git log` to find subjects under the topic's joined stems. Collect the
step numbers from its `impl-<n>` forms. A repo's share is landed only when that
repo's log carries the step form. A both-repo step remains until both shares
have landed.

The scope is the given range minus the landed repo shares. With no range it is
every remaining share of the earliest unfinished step. A range selects steps
to run sequentially, each in its own fresh context. When no share remains,
name the completed range, or say the whole plan is fully implemented for an
unscoped run, and stop.

## Coordination

The coordinator uses the app's sub-agent tools, not a CLI runner or separate
desktop tasks. If fresh sub-agents are unavailable, report that limitation
before implementation. Do not silently batch the steps in the coordinator's
context.

For each unfinished step in scope:

1. Start a new worker with no inherited conversation. In Codex, use
   `spawn_agent` with `fork_turns: "none"`. Use the current checkout and branch;
   do not create a branch or worktree. Only one implementation worker runs at
   a time, including when a step changes both repos.
2. Give it the absolute paths to this workflow, the plan and the hosting
   checkouts, its step number and remaining repo shares. State that it is the
   worker, must read this workflow and the full plan, and has the user's grant
   to implement and commit those shares after their checks pass. Pass any
   explicit user constraints or rulings that apply. The plan and repository
   are its implementation brief; do not pass earlier workers' reasoning.
3. Wait for the worker to finish. It reports each hosting repo's commit SHA,
   checks and results, any recorded deviations and any unresolved blocker.
   Confirm the step commits in Git and inspect checkout status before starting
   the next step. A worker's completion message alone does not prove a share
   landed. The coordinator checks completion, not a second implementation audit.
4. If the worker stops with unfinished work, keep later steps pending. Resolve
   a required user ruling with the user and return it to that step's worker.
   Do not start another writer while the worker is still active. On resuming
   an interrupted run, inspect Git history and the remaining diff to recover
   the unfinished shares; preserve work already present.

The coordinator uses the plan and Git history to track completion. Add no run
database or routine handoff file. The oversized-step ledger below remains
available when one step needs it. Audits run only under a user-selected scope;
the implementation range does not request an audit run.

## Steps

Intermediate steps may leave behaviour broken until later steps land. This is
not a sequencing defect and requires no workaround or approval.

Resolve routine choices and step overlaps from the whole plan and code, then
proceed. Ask only for a missing product decision or required authorisation.

The worker implements its assigned step, changing only its remaining repo shares.
After each share, run the step's named checks and that repo's required verification. Commit the
share in its repo with the shared step form in `../plan/CLAUDE.md` and the conventional postfix that
repo requires. The step form carries no severity sequence: the subject is
`<stem>/impl-<n> <tag> <kind>(<scope>): <subject>`, with the postfix stripped of the leading
sequence an ordinary commit would carry. `<tag>` is your own capability tag, which Repo Edu's
`CLAUDE.md` defines under **Commit Capability Tag**, and the body opens with the model record that
repo defines beside it. A both-repo step gets one independent commit in each repo. Each step gets
exactly one commit per hosting repo; steps never combine into one commit. The invocation that
started this run grants each in-scope repo share's commit once its checks pass.

When a step's work cannot complete inside one context window and cannot be
split into independently complete parts, follow `oversized-step.md`
beside this file: it adds a gitignored ledger and a reconstruction rule across
context boundaries while every rule above stays in force.

Where the code proves the plan wrong, implement what is right and record the
reason in the step commit's body. A deviation leaves the plan that carried
the boundaries, so check it against `../plan/BOUNDARIES.md`; a departure that
would cross a boundary stops for the user instead of landing. Write plan-tier
work into `../plan` only when the user directs it; a directed plan-file fix
lands in the same run as its own plan-repo commit in the round form. An
implementation audit defers an undirected plan-text defect in its Repo Edu
commit body.

## Close

After the workers finish, the coordinator handles closure. For each repo where
the run lands its final hosted share, run the plan's final
verification when it names any for that repo. After that repo's checkout is
clean and its log proves every share it hosts has landed, offer its shared
`implemented:` marker from `../plan/CLAUDE.md` and write it only on the user's
word. A both-repo step counts in each repo only when that repo's commit has
landed. A run that leaves work unimplemented ends with one line per repo: the
shares landed and the first step remaining there.
