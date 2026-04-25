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

- plan: `[ai-]c<N>-s<N>-r<N>-i<N>`
- repo: `m<code>-{x<N>|ai}-f<N>-c<N>-s<N>-r<N>`

`i<N>` is the coder-interaction level — a planner concern that shapes
how the planner mixes `author_index` across modules (1 = each module
has a primary owner, 2 = moderate cross-module mixing, 3 = constant
cross-module mixing). `x<N>` is the coder-experience level — a coder
concern that picks a code-style tier. Review-commit frequency is
independent (`-f / --review-frequency`, percent 0-100) and is sampled
into the plan's kind sequence by the planner.

`--ai-coders` (`-a`) on `plan` switches into **AI-coders mode**: the
planner drops student-team framing, and downstream the coder runs
without an experience tier. AI-mode prompts live in bespoke files
(`planner/plan-l0.md`, `coder/build-l0.md`, `coder/review-l0.md`,
`coder/persona-l0.md`, `coder-agreement-l0.md`) to keep the
student-mode prompts unchanged. `-x` on `repo` is silently ignored when
the plan is in AI-coders mode (experience tiers simulate student-skill
levels, which don't apply to AI coders). `--comments` still applies in
both modes — it's a pure output-style knob. The `project` subcommand
is mode-agnostic — its output is the same regardless. The `repo` stage
reads the mode from the plan's `Ai-coders:` meta line; it has no
`--ai-coders` flag of its own.

Per-run scratch files (`_state.json`, `_review.md`, `_log.md`,
`_trace.md`) are written at the `../student-repos/` root, cleared at
the start of each subsequent run, and copied into the finished repo.
`_log.md` mirrors the stdout summary (the archived plan); `_trace.md`
holds full Coder prompts and replies regardless of `-v`/`-vv`.

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
  "mp": "33",
  "mc": "23",
  "aiCoders": true,
  "coderExperience": 3,
  "coderInteraction": 2,
  "complexity": 2,
  "students": 3,
  "rounds": 3,
  "comments": 1,
  "reviewFrequency": 30
}
```

The keys above are exhaustive and the values shown are the current
hardcoded defaults from `constants.ts`. Drop the file in to lock in
those values, or edit individual keys to override.

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

`pnpm fixture` has three subcommands; run `pnpm fixture <sub> --help`
for the flags that apply to each.

| subcommand | produces | key flags |
|---|---|---|
| `project` | `c<N>-<name>/project.md` | `-m`, `-c` |
| `plan --from=<project.md>` | `c<N>-<name>/plan-<postfix>.md` | `-m`, `-s`, `-r`, `-i`, `-f`, `-a` |
| `repo --from=<plan.md>` | `c<N>-<name>/<postfix>/` git repo | `-m`, `-x`, `--comments` |

Model codes for `-m` / `--model`: `1` = haiku; `2|21|22|23` = sonnet
(default/low/medium/high); `3|31|32|33|34|35` = opus
(default/low/medium/high/xhigh/max).

`--from=PATH` accepts absolute paths or paths relative to
`../student-repos/`. When omitted, `plan` and `repo` fall back to
`../student-repos/.fixture-state.json`, which is refreshed on every
successful `project` and `plan` run — so the typical sequence reads
naturally without any `--from` flags:

```bash
pnpm fixture project -c 3                  # archives project, updates state
pnpm fixture plan -s 4 -r 5 -i 3 --no-ai-coders  # uses state.project, updates state.plan
pnpm fixture repo -x 4                     # uses state.plan
```

Explicit paths still work and override the state:

```bash
pnpm fixture plan --from=c3-NAME/project.md -s 4 -r 5 -i 3
pnpm fixture repo --from=c3-NAME -x 4      # auto-picks single plan-*.md
pnpm fixture repo --from=c3-NAME/plan-c4-s3-r3-i2.md -x 4
```
