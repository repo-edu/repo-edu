# Fixture generation

AI-driven generator that produces realistic student-repo fixtures for the
grading tool. A TypeScript orchestrator owns the plan and the loop; Claude
is only called for the parts that need creative judgement.

## Pieces

- `fixture.ts` — entry point. Dispatches subcommands; orchestrates the
  per-stage flow. The modules below own the individual phases.
- `cli.ts` — argument parsing, help, `Opts` type, model-code resolution.
- `constants.ts` — hardcoded defaults, bounds, paths, model/effort tables.
- `defaults.ts` — merges `constants.ts` with `.fixture-settings.jsonc`
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

Generated artifacts land in `../fixtures/` (sibling of the repo
root). Each (complexity, project) pair gets its own folder
`c<N>-<name>/`. Inside it, every plan gets its own subfolder named by
the plan postfix; each repo generated from that plan is a child of the
plan folder:

```text
../fixtures/
├─ .fixture-settings.jsonc          # actual values from the most recent run
├─ .fixture-sweep.jsonc             # optional sweep spec (one list-valued key)
├─ .fixture-state.json              # last project + plan pointers (auto-managed)
└─ c<N>-<name>/                     # one folder per project
   ├─ project.md                    # first; regenerations → project-v2.md, ...
   └─ <plan-postfix>/               # plan; re-runs → <plan-postfix>-v2/, ...
      ├─ plan.md                    # plan content + meta
      ├─ .fixture-settings.jsonc    # frozen snapshot of plan-time settings
      ├─ _log.md                    # plan-generation log (high-level)
      ├─ _trace.md                  # plan-generation Planner prompt + reply
      ├─ _xtrace.md                 # plan-generation agent turn log
      └─ <repo-postfix>/            # git repo; re-runs → <repo-postfix>-v2/, ...
         ├─ .fixture-settings.jsonc # frozen snapshot of full settings used for this repo
         ├─ _log.md                 # repo-run log (high-level)
         ├─ _trace.md               # per-round Coder prompts + replies
         ├─ _xtrace.md              # full agent turn log
         ├─ _review.md              # repo run summary
         └─ _state.json             # per-round coder state
```

### Postfix encoding

**Plan postfix** — `[ai-]i<N>-<style>-s<N>-r<N>-w<N>`

Segments follow `fixture plan -h` flag order; complexity is omitted
because the parent `c<N>-<name>/` folder already carries it.

- `ai-` *(optional)* — present iff `--ai-coders 1` (planner drops
  student-team framing).
- `i<N>` — coder-interaction level (`--coder-interaction`, 1-3): how
  aggressively the planner mixes `author_index` across modules. 1 =
  each module has a primary owner; 2 = moderate cross-module mixing;
  3 = constant cross-module mixing.
- `<style>` — short code from `--style`: `bb` big-bang, `inc`
  incremental, `vs` vertical-slice, `bu` bottom-up, `topd`
  top-down, `tdd` test-driven, `walk` walking-skeleton, `spik`
  spike-and-stabilize, `demo` demo-driven, `rfct` refactor-heavy.
- `s<N>` — team size (`--students`, 1-10).
- `r<N>` — build-commit count (`--rounds`, ≥1).
- `w<N>` — review-commit count (`--reviews`, 0..rounds, placed after
  a uniformly-chosen subset of build slots).

**Repo postfix** — `m<code>-o<N>`

Segments follow `fixture repo -h` flag order; everything inherited
from the parent project/plan folders is omitted.

- `m<code>` — coder model + effort (e.g. `m22` = sonnet medium; see
  the model-code table in `fixture -hh`).
- `o<N>` — comment-density tier (`-o, --comments`, 0-3); 0 leaves
  commenting to the coder.

### AI-coders mode

`-a 1` (or `--ai-coders 1`) on `plan` switches into **AI-coders mode**:

- Planner drops student-team framing.
- AI-mode prompts live in bespoke files (`planner/plan-ai.md`,
  `coder/build-ai.md`, `coder/review-ai.md`, `coder/persona-ai.md`,
  `coder-agreement-ai.md`) so student-mode prompts stay unchanged.
- `--comments` still applies in both modes — it's a pure
  output-style knob.
- `project` is mode-agnostic — its output is the same either way.
- `repo` reads the mode from the plan's `Ai-coders:` meta line; it
  has no `--ai-coders` flag of its own.

### Per-run scratch files

`_log.md`, `_trace.md`, and `_xtrace.md` are written directly into the
artifact folder they describe: a `plan` run writes them into the plan
folder; a `repo` run writes them into the repo folder, alongside
`_review.md` and `_state.json`. Each artifact therefore carries its own
forensic trail and successive runs never clobber each other. For a
`project` run (no plan exists yet), the log files stay at the
`../fixtures/` root.

All three log files are always written; `-v`/`-vv`/`-vvv` only gate
which level streams to stdout:

- `_log.md` — high-level summary (archived plan).
- `_trace.md` — per-round Planner/Coder prompts and final replies.
- `_xtrace.md` — full agent turn log (every assistant message,
  `tool_use`, and `tool_result`). File contents read/written by
  `Read`, `Write`, and `Edit` are elided to a one-line summary.

## Settings

Every CLI option has a default resolved in this precedence order:

1. Explicit CLI flag (e.g. `-c 3`) — wins when supplied.
2. `../fixtures/.fixture-settings.jsonc` — actual values from the
   most recent run, automatically rewritten on every successful
   `project` / `plan` / `repo`. Edit by hand to lock in different
   defaults.
3. Hardcoded constant in `constants.ts` (`DEFAULT_*`, `MIN_*`, `MAX_*`) —
   the single source of truth for shipped defaults; edit here to
   change what's baked in.

Frozen per-artifact snapshots are also written: the `plan` run drops
a copy in the plan folder (plan-time settings), and each `repo` run
drops one in the repo folder (full settings used for that repo). The
top-level file evolves with each run; the per-plan and per-repo
copies are written once and never overwritten — so a sweep that
shares a plan across N coder variants leaves N independent
self-describing repo folders.

Format is JSONC (JSON with `//` comments and trailing commas). Run
`fixture init` to scaffold `.fixture-settings.jsonc`,
`.fixture-sweep.jsonc`, and an empty `.fixture-state.json` before
editing, or just run any subcommand and `.fixture-settings.jsonc` is
auto-created on first use. Pass `--from=<project.md>` (e.g.
`scripts/fixtures/projects/calculator.md`) to additionally seed a
curated project under `../fixtures/c<N>-<name>/` and point
`.fixture-state.json` at it, skipping `fixture project`. Schema (all
keys optional; values are validated against the same ranges as the
CLI flags):

```jsonc
{
    "mp": "35",             // project and planner model CODE
    "mc": "22",             // coder model CODE

    // fixture project
    "complexity": 1,        // integer 1-4, project tier

    // fixture plan
    "aiCoders": true,       // AI-coders mode vs student framing
    "coderInteraction": 2,  // integer 1-3, cross-module author mixing
    "style": "incremental", // one of: big-bang | incremental | vertical-slice |
                            //         bottom-up | top-down | test-driven |
                            //         walking-skeleton | spike-and-stabilize |
                            //         demo-driven | refactor-heavy
    "students": 3,          // integer 1-10, team size
    "rounds": 3,            // integer ≥1, build-commit count
    "reviews": 1,           // integer 0..rounds, review-commit count

    // fixture repo
    "comments": 1           // integer 0-3, 3=leave to coder
}
```

The keys above are exhaustive and the values shown are the current
hardcoded defaults from `constants.ts`. Unknown keys or out-of-range
values fail fast with a message pointing at the file.
`fixture <sub> --help` reflects the effective values (hardcoded
merged with the file).

## State

`../fixtures/.fixture-state.json` records the last archived
project and plan as paths relative to `../fixtures/`. `project`
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

## Sweep mode

`fixture sweep` iterates plan and/or repo generation across the values
of one list-valued setting. The sweep file mirrors
`.fixture-settings.jsonc` exactly, except **one** key may hold a
JSON array (the swept axis). Every other key must be a scalar (or
absent, in which case the value falls back to
`.fixture-settings.jsonc`). The single-list cap is intentional: it
keeps cost predictable and side-steps cartesian-product blow-ups.

Behaviour follows from which phase the swept key belongs to **and**
what `--from` points at:

- **Plan-phase key** (`mp`, `complexity`, `aiCoders`, `coderInteraction`,
  `style`, `students`, `rounds`, `reviews`):
  - `--from` must be a project (or omitted, falling back to
    `state.project`). Plan-phase sweeps cannot reuse an existing plan.
  - For each value: run plan, then run repo. Yields N plan dirs, one
    repo each.
- **Repo-phase key** (`mc`, `comments`):
  - `--from` may be a project (plan once with the first value's
    settings, then iterate repos against that shared plan) **or** a
    plan (skip planning entirely, iterate repos against the existing
    plan — useful for comparing coder models on a plan you've already
    judged).
  - Without `--from`, falls back to `state.plan` if set, else
    `state.project`.

`--sweep=PATH` selects the sweep file; defaults to
`../fixtures/.fixture-sweep.jsonc`. `--from` accepts the same path
shapes as `plan` / `repo`: a `.md` file or a directory, absolute or
relative to `../fixtures/`.

Two example sweeps live in [sweeps/](sweeps/):

- [`sweeps/compare-coder-styles.jsonc`](sweeps/compare-coder-styles.jsonc)
  — plan-phase sweep across all 10 styles.
- [`sweeps/compare-coder-models.jsonc`](sweeps/compare-coder-models.jsonc)
  — repo-phase sweep across the 7 informative coder models.

```bash
pnpm fixture project -c 2
pnpm fixture sweep \
  --sweep=scripts/fixtures/sweeps/compare-coder-styles.jsonc

# Re-run a coder-model bake-off against an existing plan, no re-planning:
pnpm fixture sweep \
  --from=c2-NAME/ai-i2-vs-s3-r10-w0 \
  --sweep=scripts/fixtures/sweeps/compare-coder-models.jsonc
```

The sweep file shape (plan-phase example):

```jsonc
{
    "mp": "35",
    "aiCoders": true,
    "coderInteraction": 2,
    "students": 3,
    "rounds": 6,
    "reviews": 0,
    "mc": "22",
    "comments": 1,
    "style": [           // exactly one key may be a list
        "big-bang", "incremental", "vertical-slice"
    ]
}
```

### Evaluating a sweep

`pnpm fixture evaluate` walks one directory recursively, finds every
folder that contains `_state.json` (a generated repo), scores each
one with an LLM judge, and writes a Markdown report at
`<root>/_evaluate.md`:

```bash
# Repo-phase sweep — point at the shared plan dir
pnpm fixture evaluate --from=c2-NAME/<plan-postfix>

# Plan-phase sweep — point at the project; the walk picks up every
# repo under every plan-postfix sibling
pnpm fixture evaluate --from=c2-NAME

# Or omit --from to fall back to .fixture-state.json's project
# (and ../fixtures/ itself if state is empty)
pnpm fixture evaluate
```

The walk stops descending at the first folder that contains
`_state.json`, so a project / plan / repo dir all work as
roots. Override the destination with `--out=PATH`. The evaluator
model defaults to opus max; override with `-m CODE`.

## Entry point

`pnpm fixture` has six subcommands; run `pnpm fixture <sub> -h`
for the flags that apply to each, or `pnpm fixture -hh` for the full
reference (every subcommand plus the model-code table and
`.fixture-settings.jsonc` schema). The six are `init`, `project`,
`plan`, `repo`, `sweep`, and `evaluate`.

| subcommand | produces | key flags |
|---|---|---|
| `init` | `.fixture-settings.jsonc` + `.fixture-sweep.jsonc` + empty `.fixture-state.json` (scaffold) | `-f` |
| `project` | `c<N>-<name>/project.md` | `-m`, `-c` |
| `plan --from=<project.md>` | `c<N>-<name>/<plan-postfix>/plan.md` | `-m`, `-s`, `-r`, `-w`, `-i`, `-y`, `-a` |
| `repo --from=<plan.md>` | `c<N>-<name>/<plan-postfix>/<repo-postfix>/` git repo | `-m`, `-o` |
| `sweep [--from=<project\|plan>] [--sweep=<sweep.jsonc>]` | N plan+repo (plan-phase key) or one plan + N repos (repo-phase key); `--from=<plan>` reuses an existing plan | `--from`, `--sweep` |
| `evaluate [--from=<dir>] [--out=PATH]` | `<root>/_evaluate.md` — scores every repo found by walking `<root>` | `--from`, `--out`, `-m` |

Model codes for `-m` / `--model`:

- Claude: `1` = haiku; `2|21|22|23` = sonnet (default/low/medium/high);
  `3|31|32|33|34|35` = opus (default/low/medium/high/xhigh/max).
- Codex: `c1` = gpt-5.4-mini; `c2|c21|c22|c23|c24` = gpt-5.4
  (default/low/medium/high/xhigh); `c3|c31|c32|c33|c34` = gpt-5.5
  (default/low/medium/high/xhigh).

Codex codes are accepted for `mp` (planner / evaluator) only — `mc`
stays Claude-only because the coder uses workspace-write tools that
the multi-provider contract intentionally does not expose. Each
generated dirname includes the resolved model's version tag (e.g.
`m22-46`, `mc22-54`) so cross-generation runs stay distinguishable.

Both auth modes work with both providers: a logged-in subscription
(Claude `claude` CLI session, ChatGPT login under `codex`) or an
explicit API key (`ANTHROPIC_API_KEY`, `CODEX_API_KEY`). The active
auth mode shows up in `_review.md` as a bare `$1.23` (api) or
`~$1.23` (subscription, API-equivalent estimate).

`--from=PATH` accepts absolute paths or paths relative to
`../fixtures/`. When omitted, `plan` and `repo` fall back to
`../fixtures/.fixture-state.json`, which is refreshed on every
successful `project` and `plan` run — so the typical sequence reads
naturally without any `--from` flags:

```bash
pnpm fixture project -c 3                  # archives project, updates state
pnpm fixture plan -s 4 -r 5 -i 3 -a 0            # uses state.project, updates state.plan
pnpm fixture repo -o 2                     # uses state.plan
```

Explicit paths still work and override the state:

```bash
pnpm fixture plan --from=c3-NAME/project.md -s 4 -r 5 --reviews 2 -i 3
pnpm fixture repo --from=c3-NAME -o 2              # auto-picks single plan subfolder
pnpm fixture repo --from=c3-NAME/bb-c4-s3-r5-w2-i3/   # plan dir
pnpm fixture repo --from=c3-NAME/bb-c4-s3-r5-w2-i3/plan.md -o 2
```
