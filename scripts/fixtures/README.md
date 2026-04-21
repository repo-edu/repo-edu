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

Generated repos land in `../student-repos/` (sibling of the repo root,
each is its own `git init`). Every run also writes `_plan.json`,
`_state.json`, and `_review.md` alongside the repo folder; the orchestrator
clears those three files at the start of the next run.

## Entry point

`pnpm create:fixture` — run `--help` for the full option list. Flags:
`-r/--rounds` (build-commit count), `-c/--complexity` (1–4),
`-s/--students` (1–10), `-l/--coder-level` (1–4),
`-f/--review-frequency` (0–100% per-build chance the next round is a
review; reviews are extra, not counted in `-r`).
Model codes for `--mp` (planner) and `--mc` (coder): `1` = haiku;
`2|21|22|23` = sonnet (default/low/medium/high); `3|31|32|33|34|35` =
opus (default/low/medium/high/xhigh/max); `--mc=0` stops after the
planner step.
