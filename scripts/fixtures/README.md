# Fixture generation

AI-driven generator that produces realistic student-repo fixtures for the
grading tool. A TypeScript orchestrator owns the plan and the loop; Claude
is only called for the parts that need creative judgement.

## Pieces

- `create-fixture.ts` — TypeScript orchestrator. Parses flags, runs one
  planner turn via the Claude Agent SDK (assignment, team personas,
  per-commit goals), then one Coder agent per commit (Read/Write/Edit/Bash
  tools enabled, permissions bypassed) to do the actual work.
- `coder-agreement.md` — shared working agreement the Coder reads at the
  start of every round (team norms, commit conventions, review-round
  behaviour).
- `plan-multi-agent.md` — background design document.

## Output

Generated repos land in `.student-repos/` at the repo root (gitignored,
each is its own `git init`). Every run also writes `_plan.json`,
`_state.json`, and `_review.md` alongside the repo folder; the orchestrator
clears those three files at the start of the next run.

## Entry point

`pnpm create:fixture` — run `--help` for the full option list. Flags:
`-r/--rounds`, `-c/--complexity` (1–4), `-s/--students` (1–10),
`-m/--model` (planner model), `-u/--until-done` (soft-target mode, stops
early when the Coder reports the assignment is done).
