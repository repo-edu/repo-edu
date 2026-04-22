# Fixture generation

AI-driven generator that produces realistic student-repo fixtures for the
grading tool. A TypeScript orchestrator owns the plan and the loop; Claude
is only called for the parts that need creative judgement.

## Pieces

- `fixture.ts` — entry point. Dispatches subcommands; orchestrates the
  per-stage flow. The modules below own the individual phases.
- `cli.ts` — argument parsing, help, `Opts` type, model-code resolution.
- `constants.ts` — hardcoded defaults, bounds, paths, model/effort tables.
- `defaults.ts` — merges `constants.ts` with `.fixture-defaults.json`
  (see [Defaults](#defaults) below).
- `state.ts` — reads/writes `.fixture-state.json` (last project + plan
  pointers, so `plan` / `repo` can skip `--from`).
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

Generated artifacts land in `../student-repos/` (sibling of the repo
root). Each (complexity, project) pair gets its own folder
`c<N>-<name>/` that holds the project description, one or more plans,
and the generated repos:

```text
../student-repos/
  c<N>-<name>/
    project.md               # first; later regenerations → project-v2.md, ...
    plan-<postfix>.md        # plan; re-runs → plan-<postfix>-v2.md, ...
    <postfix>/               # git repo; re-runs → <postfix>-v2/, ...
```

The postfixes encode run parameters:

- plan: `mp<code>-c<N>-s<N>-r<N>-i<N>`
- repo: `mp<code>-mc<code>-l<N>-c<N>-s<N>-r<N>-i<N>`

`i<N>` is the interaction level: it governs cross-module editing only
(1 = stay in your module, 2 = moderate cross-module work, 3 =
frequent cross-module work). Review-commit frequency is independent —
set it with `-f / --review-frequency` (percent, 0-100). `-i` is
ignored at `-l 0`; `-f` applies at every level.

`-l 0` switches the whole pipeline into **AI-coders mode**: the planner
and coder prompts drop all student-team framing, and quality differences
come from model choice (`--mp` / `--mc`) instead. L0 prompts live in
bespoke files (`planner/project-l0.md`, `planner/plan-l0.md`,
`coder/build-l0.md`, `coder/review-l0.md`, `coder/persona-l0.md`,
`coder-agreement-l0.md`) to keep the L1-4 prompts unchanged. `-i` and
`--comments` are silently ignored at L0. The `repo` stage requires
`-l 0` when the plan was generated at L0 (the plan meta records
`Coder-level:`), and vice versa.

Per-run scratch files (`_state.json`, `_review.md`, `_log.md`) are
written at the `../student-repos/` root, cleared at the start of each
subsequent run, and copied into the finished repo.

## Defaults

Every CLI option has a default resolved in this precedence order:

1. Explicit CLI flag (e.g. `-c 3`) — wins when supplied.
2. `../student-repos/.fixture-defaults.json` — per-machine overrides.
3. Hardcoded constant in `constants.ts` (`DEFAULT_*`, `MIN_*`, `MAX_*`) —
   the single source of truth for shipped defaults; edit here to
   change what's baked in.

The config file is optional. Drop it alongside `.fixture-state.json`
to override any subset of the defaults without editing source:

```json
{
  "complexity": 3,
  "students": 4,
  "rounds": 5,
  "coderLevel": 3,
  "comments": 2,
  "interaction": 3,
  "reviewFrequency": 30,
  "mp": "33",
  "mc": "23"
}
```

All keys are optional. Values are validated against the same ranges
as the CLI flags; unknown keys or out-of-range values fail fast with
a message pointing at the file. `fixture <sub> --help` reflects the
effective defaults (hardcoded merged with the file).

## State

`../student-repos/.fixture-state.json` records the last archived
project and plan as paths relative to `../student-repos/`. `project`
and `plan` rewrite it on success; `repo` reads it. This is what lets
`plan` and `repo` run with no `--from` (see examples below). Delete or
edit the file to reset or point at specific artifacts.

## Entry point

`pnpm fixture` has four subcommands; run `pnpm fixture <sub> --help` for
the flags that apply to each.

| subcommand | produces | key flags |
|---|---|---|
| `project` | `c<N>-<name>/project.md` | `-c`, `--mp` |
| `plan --from=<project.md>` | `c<N>-<name>/plan-<postfix>.md` | `-r`, `-s`, `-i`, `-f`, `--mp` |
| `repo --from=<plan.md>` | `c<N>-<name>/<postfix>/` git repo | `-l`, `--mc`, `--comments` |
| `all` | all three in sequence | union of the above |

Model codes for `--mp` / `--mc`: `1` = haiku; `2|21|22|23` = sonnet
(default/low/medium/high); `3|31|32|33|34|35` = opus
(default/low/medium/high/xhigh/max).

`--from=PATH` accepts absolute paths or paths relative to
`../student-repos/`. When omitted, `plan` and `repo` fall back to
`../student-repos/.fixture-state.json`, which is refreshed on every
successful `project` and `plan` run — so the typical sequence reads
naturally without any `--from` flags:

```bash
pnpm fixture project -c 3         # archives project, updates state
pnpm fixture plan -s 4 -r 5 -i 3  # uses state.project, updates state.plan
pnpm fixture repo -l 4            # uses state.plan
```

Explicit paths still work and override the state:

```bash
pnpm fixture all -c 3 -s 3 -r 3 -i 2
pnpm fixture plan --from=c3-NAME/project.md -s 4 -r 5 -i 3
pnpm fixture repo --from=c3-NAME -l 4      # auto-picks single plan-*.md
pnpm fixture repo --from=c3-NAME/plan-mp33-c4-s3-r3-i2.md -l 4
```
