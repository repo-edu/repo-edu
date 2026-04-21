# Fixture generation

AI-driven generator that produces realistic student-repo fixtures for the
grading tool. A TypeScript orchestrator owns the plan and the loop; Claude
is only called for the parts that need creative judgement.

## Pieces

- `fixture.ts` — entry point. Dispatches subcommands; orchestrates the
  per-stage flow. The modules below own the individual phases.
- `cli.ts` — argument parsing, help, `Opts` type, model-code resolution.
- `constants.ts` — defaults, bounds, paths, model/effort tables.
- `log.ts` — stderr progress, ticker, verbose `_log.md` sink, `fail()`.
- `agent.ts` — thin wrapper over `@anthropic-ai/claude-agent-sdk` `query`.
- `planner.ts` — two planner turns: project (name + assignment) and plan
  (team + commits). Runs validation against the sampled kind sequence.
- `sampler.ts` — per-slot Bernoulli sampler for review slots.
- `coder.ts` — Coder prompt composition, per-commit loop, repo init.
- `review.ts` — run summary written to `_review.md`.
- `naming.ts` — directory postfix, model-code encoding, next-available.
- `project-md.ts`, `plan-md.ts` — serialisers for the archived artifacts.
- `prompt-loader.ts` — template expansion for `prompts/**/*.md`.
- `coder-agreement.md` — shared working agreement the Coder reads at the
  start of every round (team norms, commit conventions, review-round
  behaviour).
- `plan-multi-agent.md` — background design document.

## Output

Generated repos land in `../student-repos/` (sibling of the repo root,
each its own `git init`). Each run also archives:

- `_projects/<name>.md` — project description (name, assignment,
  complexity). Generated once per project; reusable via `--project`.
- `_plans/<postfix>-<name>.md` — team + commit plan. References the
  project by name. Reusable via `--plan`.
- `_state.json`, `_review.md`, `_log.md` — per-run trace, cleared at the
  start of each subsequent run and copied into the finished repo.

## Entry point

`pnpm fixture` has four subcommands; run `pnpm fixture <sub> --help` for
the flags that apply to each.

| subcommand | produces | key flags |
|---|---|---|
| `project` | `_projects/<name>.md` | `-c`, `--mp` |
| `plan --from=<project.md>` | `_plans/<postfix>-<name>.md` | `-r`, `-s`, `-f`, `--mp` |
| `repo --from=<plan.md>` | `<name>-<postfix>/` git repo | `-l`, `--mc`, `--comments` |
| `all` | all three in sequence | union of the above |

Model codes for `--mp` / `--mc`: `1` = haiku; `2|21|22|23` = sonnet
(default/low/medium/high); `3|31|32|33|34|35` = opus
(default/low/medium/high/xhigh/max).

Typical sweep over the same project:

```bash
pnpm fixture all -c 3 -s 3 -r 3 -f 30
pnpm fixture plan --from=../student-repos/_projects/NAME.md -s 4 -r 5 -f 20
pnpm fixture repo --from=../student-repos/_plans/FILE.md -l 4
pnpm fixture project -c 4              # just a project, for later reuse
```
