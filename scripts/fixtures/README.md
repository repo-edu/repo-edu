# Fixture generation

AI-driven generator that produces realistic student-repo fixtures for the
grading tool. A TypeScript orchestrator owns the plan and the loop; Claude
is only called for the parts that need creative judgement.

## Pieces

- `fixture.ts` — entry point. Dispatches subcommands; orchestrates the
  per-stage flow. The modules below own the individual phases.
- `cli.ts` — argument parsing, help, `Opts` type, model-code resolution.
- `constants.ts` — hardcoded defaults, bounds, paths, model/effort tables.
- `defaults.ts` — merges `constants.ts` with `.fixture-settings.json`
  (see [Settings](#settings) below).
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
`c<N>-<name>/`. Inside it, every plan gets its own subfolder named by
the plan postfix; each repo generated from that plan is a child of the
plan folder:

```text
../student-repos/
  .fixture-settings.json     # actual values from the most recent run
  .fixture-state.json        # last project + plan pointers (auto-managed)
  c<N>-<name>/
    project.md               # first; later regenerations → project-v2.md, ...
    <plan-postfix>/          # plan; re-runs → <plan-postfix>-v2/, ...
      plan.md                # plan content + meta
      .fixture-settings.json # snapshot of settings used for this plan/repo
      _log.md  _trace.md     # run log + trace
      _review.md             # repo run summary
      _state.json            # per-round coder state
      <repo-postfix>/        # git repo; re-runs → <repo-postfix>-v2/, ...
```

The postfixes encode run parameters:

- plan: `[ai-]c<N>-s<N>-r<N>-w<N>-i<N>`
- repo: `m<code>-{x<N>|ai}-c<N>-s<N>-r<N>`

`w<N>` is the review-commit count (0..rounds): `--reviews` reviews are
placed after a uniformly-chosen subset of build slots.

`i<N>` is the coder-interaction level — a planner concern that shapes
how the planner mixes `author_index` across modules (1 = each module
has a primary owner, 2 = moderate cross-module mixing, 3 = constant
cross-module mixing). `x<N>` is the coder-experience level — a coder
concern that picks a code-style tier. The review-commit count is set
directly via `--reviews` (0 ≤ reviews ≤ rounds) and placed at uniformly
random build slots in the plan's kind sequence.

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

Per-run scratch files (`_log.md`, `_trace.md`, `_xtrace.md`,
`_review.md`, `_state.json`) live inside the plan folder for `plan`
and `repo` runs, so a subsequent run against a different plan never
overwrites them. For a `project` run (no plan exists yet), the log
files stay at the `../student-repos/` root. All three log files are
always written; `-v`/`-vv`/`-vvv` only gate which level streams to
stdout:

- `_log.md` — high-level summary (archived plan).
- `_trace.md` — per-round Planner/Coder prompts and final replies.
- `_xtrace.md` — full agent turn log (every assistant message,
  tool_use, and tool_result). File contents read/written by Read,
  Write, and Edit are elided to a one-line summary.

## Settings

Every CLI option has a default resolved in this precedence order:

1. Explicit CLI flag (e.g. `-c 3`) — wins when supplied.
2. `../student-repos/.fixture-settings.json` — actual values from the
   most recent run, automatically rewritten on every successful
   `project` / `plan` / `repo`. Edit by hand to lock in different
   defaults.
3. Hardcoded constant in `constants.ts` (`DEFAULT_*`, `MIN_*`, `MAX_*`) —
   the single source of truth for shipped defaults; edit here to
   change what's baked in.

A copy of `.fixture-settings.json` is also written inside the plan
folder, capturing the settings that produced that specific
plan/repo. The top-level file evolves with each run; the per-plan
copy is frozen alongside the artifacts it describes.

Schema (all keys optional; values are validated against the same
ranges as the CLI flags):

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
  "reviews": 1,
  "style": "big-bang"
}
```

The keys above are exhaustive and the values shown are the current
hardcoded defaults from `constants.ts`. Unknown keys or out-of-range
values fail fast with a message pointing at the file.
`fixture <sub> --help` reflects the effective values (hardcoded
merged with the file).

## State

`../student-repos/.fixture-state.json` records the last archived
project and plan as paths relative to `../student-repos/`. `project`
and `plan` rewrite it on success; `repo` reads it. This is what lets
`plan` and `repo` run with no `--from` (see examples below). Delete or
edit the file to reset or point at specific artifacts.

## Plan styles

`--style` selects the structural shape of the commit timeline.
Same parameters with different styles produce visibly different
repos:

- `big-bang` (default) — round 1 is one author committing a skeleton
  architecture defining every module; later rounds flesh modules out.
- `incremental` — start with one module skeleton; new modules are
  introduced one-per-round across the early schedule.
- `vertical-slice` — every commit touches multiple modules; modules
  grow in lockstep, no single-module commits.
- `bottom-up` — early rounds build shared utilities and types;
  features and integrations land later.
- `top-down` — early rounds scaffold high-level features as stubs;
  later rounds replace stubs with real implementations.

The full prompt fragments live at [prompts/planner/style.md](prompts/planner/style.md).

## Batch mode

`fixture batch <list.json>` drives multiple plan+repo entries against
a single fixed project. Each entry is generated, then removed from the
file on success. Stops on the first failure (the failed entry stays
in the file for a manual retry).

File shape:

```json
{
  "project": "c3-trail-conditions-aggregator/project.md",
  "entries": [
    {
      "mp": "33", "mc": "22", "aiCoders": true,
      "coderExperience": 3, "coderInteraction": 3,
      "students": 3, "rounds": 6, "reviews": 2,
      "comments": 1, "style": "incremental"
    },
    {
      "mp": "33", "mc": "22", "aiCoders": true,
      "coderExperience": 3, "coderInteraction": 3,
      "students": 3, "rounds": 6, "reviews": 2,
      "comments": 1, "style": "vertical-slice"
    }
  ]
}
```

`project` is either a path to an existing project (`project.md` file
or a `c<N>-<name>/` directory) or a generation spec
`{ "complexity": N, "mp": "CODE" }` to generate a fresh one. Each
entry's keys mirror `.fixture-settings.json`; missing fields fall
back to the top-level `.fixture-settings.json` snapshot.

## Entry point

`pnpm fixture` has four subcommands; run `pnpm fixture <sub> --help`
for the flags that apply to each.

| subcommand | produces | key flags |
|---|---|---|
| `project` | `c<N>-<name>/project.md` | `-m`, `-c` |
| `plan --from=<project.md>` | `c<N>-<name>/<plan-postfix>/plan.md` | `-m`, `-s`, `-r`, `-w`, `-i`, `-y`, `-a` |
| `repo --from=<plan.md>` | `c<N>-<name>/<plan-postfix>/<repo-postfix>/` git repo | `-m`, `-x`, `--comments` |
| `batch <list.json>` | one plan+repo per entry under one shared project | — (entry fields) |

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
pnpm fixture plan --from=c3-NAME/project.md -s 4 -r 5 --reviews 2 -i 3
pnpm fixture repo --from=c3-NAME -x 4              # auto-picks single plan subfolder
pnpm fixture repo --from=c3-NAME/bb-c4-s3-r5-w2-i3/   # plan dir
pnpm fixture repo --from=c3-NAME/bb-c4-s3-r5-w2-i3/plan.md -x 4
```
