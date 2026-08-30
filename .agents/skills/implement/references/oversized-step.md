# Oversized step

This reference governs a step whose work cannot complete inside one context
window and cannot be split into independently complete parts. The session will
lose its conversation state to compaction or a fresh start before the step
lands. The step's plan, checks, commit form and one-commit-per-repo rule from
`workflow.md` stay in force; this reference only adds how to survive the
context boundary.

## Ledger

Before the first change, create a gitignored ledger file at the Repo Edu root
named `LEDGER-<topic>-step-<n>.md`. It records the step's obligations, the
invariants the plan binds, the files changed so far, concrete evidence and
failures from checks, unresolved decisions and the single next action. Update
it when the evidence changes, not on a fixed cadence.

The ledger is orientation, never truth. The worktree, the complete diff, the
compiler and the tests are truth. A compaction summary is lossy orientation of
the same rank as the ledger: never treat either as proof that work is done.

## Working method

- Implement the next connected piece of work. Do not manufacture fixed phases
  sized to a context window.
- Write or update the step's contract tests as soon as the contract is known,
  and run the most relevant checks after each connected piece.
- Do not land intermediate commits to manage context. The step still lands as
  exactly one commit per hosting repo when it is complete and checked.
- Do not add temporary compatibility code to keep a half-changed tree green
  between pieces; finish the connected piece instead.

## After a context boundary

Reread the plan and the ledger, then inspect repository truth: worktree
status, the complete diff, compiler output and test results. Continue from the
next unmet obligation the truth shows, not from what the summary or ledger
says was in progress.

## Close

Before declaring the step complete, audit the whole obligation set against the
final diff in a fresh context, then run the step's named checks and the repo's
required verification as `workflow.md` requires. Delete the ledger in the same
turn the step's commit lands; the commit body carries what must survive.
