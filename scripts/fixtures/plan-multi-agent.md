# Plan — `multi-agent-create-repos` Skill

## Problem

The existing `create-students-repo` skill has Claude hand-author every line of
every file across 10 commits. Output is thin (150–200 lines per repo, stub-level
modules) because the planner and the coder are the same agent, with the same
context budget, running sequentially.

This doesn't reflect how modern students actually work: they describe what they
want to an AI and iterate. A fixture generator that mirrors that process should
produce fixtures that look like what the grading tool will actually have to
grade.

### Downstream use: per-student question generation

Grading is not the only consumer of these fixtures. Having AI available to
students often leads teams to submit **perfectly working solutions that no
individual team member can fully explain**. This changes what the tool has to
assess:

- The old signal "does the code work" is saturated — most submissions will pass
  functional checks.
- The new signal needed is "does each student understand what they committed."

A planned feature of the grading tool is an agent that, per student, analyses
that student's own commits and diffs to generate bespoke comprehension questions
— questions only answerable by someone who actually wrote the code, not by
someone reading it for the first time.

A direct consequence: **bugs in the fixture repo are not essential.** The
current skill's requirement of ≥2 error-introducing and ≥2 error-fixing commits
was modelled on pre-AI student work. Realistic AI-assisted submissions are often
clean. v1 can safely produce bug-free repos without losing fidelity — the value
lives in per-author substance and style, not in planted errors.

Developing that feature requires fixtures where:

- Each author's commits are individually substantial enough to support question
  generation (not one-line tweaks).
- Author attribution is meaningful — the code committed under author X should
  reflect choices and idioms distinguishable from author Y, not just the same
  agent's output with different `--author` flags.
- The repo as a whole is plausibly a real team project, so questions probing
  "why did you structure X this way" have a real answer.

This reinforces the v1 decision to keep 3 rotating authors and raises a new
realism bar: per-author style variation, covered under [Known
trade-offs](#known-trade-offs).

### Coordinator ignorance is a realism constraint

Real student teams using AI typically operate with a **driver who does not read
the code**. They describe what they want, accept what the AI produces, run it,
and iterate based on observed behaviour. They don't inspect diffs to judge
whether a change is substantive or idiomatic — that's exactly the skill the
downstream question- generation feature is supposed to measure the absence of.

The Coordinator must embody the same ignorance. It may:

- Read file paths, file counts, and file sizes (`git status`, `wc -l`).
- Run the code and observe exit status / stdout / stderr.
- Ask the Coder for self-reported commit messages and summaries — students
  routinely ask AI to write their commit messages too, so this is
  in-character.
- Compose prompts from the plan and prior Coder self-reports.

It must **not**:

- Read source file contents to judge quality or substance.
- Parse diffs to decide which changes matter.
- Use code understanding as input to staging, prompting, or commit message
  decisions.

This rules out any "Coordinator picks the most substantive files" step and
reshapes commit-message composition (see
[Per-commit round](#per-commit-round)) — the Coder both does the work and
narrates it; the Coordinator only decides *when* each commit lands and under
whose name.

## Approach

Two-role orchestration for v1: a **Coordinator** (main skill thread) that owns
the plan and commits, and a **Coder** sub-agent (spawned via the `Agent` tool
with an explicit `model` — see [Coder model selection](#coder-model-selection))
that does the bulk code generation per round. The Coordinator writes prompts and
commits; the Coder writes code.

A third **Tester** role is designed but **deferred to v2** — see [Deferred:
Tester role](#deferred-tester-role-v2).

| Role | Who | Task |
|---|---|---|
| Coordinator | main skill thread | Owns the plan, tracks state, authors prompts for the Coder, stages and commits whatever the Coder produced |
| Coder | `Agent` tool with `model` pinned to a specific ID (TBD — Haiku as starting default, see [Coder model selection](#coder-model-selection)) | Receives a student-style natural-language prompt, edits code in the repo, self-reports a one-line commit message |

The Coordinator never writes code directly. The Coder is a standard coding agent
and produces realistic volume "for free" because it's a full Claude Code agent,
not a constrained planner.

## Scope

**One repo, end-to-end, working.** Keep multi-author from the current skill (3
committers rotating per plan) — the Coder doesn't need to know about authors, so
it's nearly free and preserves the grading-tool signal the current fixtures
provide. Do not generalize to multiple repos until a single repo looks good.

**Number of rounds N is a tuning knob, not a fixed target.** The current skill
produces 10 commits; that's the ceiling for v1, not the starting point. Begin
iteration at **N=3** while tuning Coordinator prompts and Coder model
selection — every change is cheaper to evaluate at 3 rounds than at 10. Ramp
N up once per-round output consistently clears the quality floors in
[Success criteria](#success-criteria). The `--rounds=N` flag is the normal
invocation, not a dry-run mode.

## Iteration model

v1 does not try to recover from in-run failures. If a round goes sideways — the
Coder produces garbage, a commit ends up empty, the output looks thin — the
run fails and the user re-runs or edits the skill. Do not build retry,
rollback-and-re-prompt, or in-run quality gates beyond what's needed to surface
the failure. The iteration loop lives at the full-repo level, not inside a run.

A direct consequence: shape constraints (file counts per commit, ranking,
reconciliation) fall away. Big changes in few files and small changes in many
files are both acceptable shapes; the Coordinator accepts whatever the Coder
produced and commits it.

## Architecture

### Shared state

Files in cwd (which is the student-repo directory being built):

- `_plan.json` — Coordinator writes this in Phase 1. Assignment description,
  `team` (3 authors, each with an `area` of responsibility — see trade-off 3),
  and exactly N commits with dates / `author_index` / `note` (N from
  `--rounds=N`). A `message` field is still written but is a fallback only,
  used if the Coder doesn't return a one-liner.
- `_state.json` — written by Coordinator between rounds. Tracks:
  - `commit_index`: which commit we're on (0 to N−1)
  - `coder_notes`: per-round summary of what the Coder reported doing
- `_review.md` — written at run end (see [Success criteria](#success-criteria)).

The Coordinator collects `existing_dirs` (names to avoid when picking a
directory name) by listing cwd at the top of Phase 1 — one `ls` call, skip
entries starting with `.` or `_`. No pre-step or separate constraints file.

**Cleanup is at start, not end, and runs in the wrapper script — not the
Coordinator.** `scripts/fixtures/create-fixture.mjs` removes any leftover
`_plan.json`, `_state.json`, and `_review.md` before invoking `claude`;
trivial deterministic work shouldn't burn Opus tokens. Nothing is deleted at
the end — working files persist in cwd until the next run, so crashes
mid-run leave state inspectable.

### Per-commit round

For commit `i` of the N planned commits:

1. Coordinator reads `_plan.json[commits][i]`.
2. Coordinator synthesizes a **student-style prompt** for the Coder:
   - What the student wants to achieve this round (derived from the planned
     commit message + assignment context).
   - Informal, first-person, sometimes sloppy tone. Occasionally asks for
     something off-plan ("also can you add a progress bar").
   - **No file-count cap in the prompt.** The Coder is told the repo path and
     the goal; it writes whatever feels natural. There is no post-hoc shape
     enforcement either — see [Iteration model](#iteration-model).
3. Coordinator spawns the Coder with that prompt and asks the Coder to reply
   with a one-line commit message describing what it did.
4. Coordinator stages everything the Coder produced (`git -C DIR add -A`). No
   reconciliation, no file-count cap, no ranking — see
   [Iteration model](#iteration-model).
5. Coordinator uses the Coder's one-line commit message verbatim; the plan's
   `message` is a fallback only. The plan still controls author and date:
   `git -C DIR commit --author="Name <email>" --date="..." -m "..."`.
6. Coordinator advances `commit_index` and updates `_state.json` with the
   Coder's self-reported summary.

## Role design

### Coder prompt template

The Coder doesn't need to know it's playing a student. It's a real coding agent
doing real work. The student persona lives in the *wording* of the prompt.

Template (filled per round):

> I'm working on a small Python assignment: {assignment_description}. The repo
> is at {abs_path}. So far I have: {cumulative_file_list}.
>
> Right now I want to {round_goal}.
>
> Please edit the files and make it work. Keep it simple — this is a student
> project, don't over-engineer. {occasional: can you add a comment explaining
> what you did.}
>
> When you're done, reply with one short sentence I could use as a git commit
> message.

Coordinator chooses voice register per round: mostly first-person informal,
occasionally terse, once or twice sloppy ("fix the thing that broke").

### Coder model selection

Which model to spawn the Coder with is an **open question to settle
empirically** during prompt tuning, not up-front. Two independent axes must both
be decided:

1. **Family:** Haiku vs. Sonnet vs. Opus.
2. **Version:** current/frontier release vs. an older/cheaper release of the
   same family.

Three properties the chosen model should have, all pulling the same direction:

- **Realism.** Students typically use whatever AI is cheapest or default, not
  frontier models. Good-but-not-great output is closer to what real submissions
  look like — small awkwardnesses, occasional overlooked edge cases, no frontier
  polish. This directly serves the question-generation downstream: code with
  mild imperfections gives the question generator more to key on than
  uniformly-excellent output.
- **Speed.** 10 rounds × sub-agent cold-starts is the wall-time bottleneck.
- **Cost.** Iterating on Coordinator prompts means many full runs.

Candidates to evaluate (family × version), in order of likely fit:

- **Current Haiku** — the starting default. Cheap, fast, realistically
  imperfect.
- **An older Haiku release**, if a legacy model ID is still reachable — may be
  even closer to the "whatever is default" student experience.
- **An older/cheaper Opus release** — might give more volume per round than
  Haiku while keeping the "not-frontier" feel.
- **Current Sonnet** — higher quality risks being too polished, but worth
  comparing if Haiku lines are consistently too thin.
- **An older Sonnet release** — a middle ground between old Haiku and current
  Sonnet.

Ruled out: current-frontier Opus. It would defeat the realism goal *and* burn
the iteration budget.

**Spawn mechanism: `Agent` tool with explicit `model` ID.** Per the Claude Code
subagents docs, the `Agent` tool's `model` parameter accepts full model IDs
(e.g. `claude-haiku-3-5-20241022`) in addition to the family aliases, so both
axes — family and version — are controllable via the native mechanism. Going
with the cleanest solution first:

- Environment, sandbox, and permission inheritance are free; no flag-propagation
  spike required.
- The Coder's self-reported commit message and file ranking come back as
  structured tool-result content, not stdout to parse.
- `isolation: "worktree"` is a one-line v2 knob if we ever want hermetic rounds.
- Less code in the skill overall.

**Cost/wall-time visibility via instrumentation, not auto-evaluation.** The
Coordinator records wall-time and input/output token usage per Coder round
from the `Agent` tool result, totals them across the run, and surfaces both
in `_review.md` and stdout (see [Deliverables](#deliverables)). Whether the
`Agent` tool path stays or the skill falls back to nested `claude --model` via
`Bash` is a user decision driven by observed numbers, not a scheduled
evaluation step. Direct Anthropic SDK calls remain a further-downstream
fallback only.

The Coordinator itself stays on whatever model the outer skill invocation uses —
it's doing orchestration and prompt authoring, not code generation.

Run at low N (typically `--rounds=3`) to compare candidates on the same plan:
measure lines/commit, per-module sizes, per-round wall time, and inspect a
handful of outputs side-by-side. Pick the combination that hits the
Success-criteria floors with the most realism and lowest cost, in that order.

### Deferred: Tester role (v2)

A Tester sub-agent was considered for v1 to review each round and feed back into
the next prompt. As designed, its output only flowed into the *wording* of the
next Coder prompt; `_plan.json` stayed frozen. That made the Tester's
contribution mostly cosmetic and risked burning iteration cost on a role about
to be redesigned.

v2 plan: reintroduce Tester **with authority to revise `_plan.json` for
remaining commits** — adjusting notes or messages based on what it observes.
Until then, the Coordinator uses only `git status`, file sizes, and the Coder's
self-reported commit message between rounds (consistent with [Coordinator
ignorance](#coordinator-ignorance-is-a-realism-constraint)).

## Known trade-offs

1. **Bug-introduction cadence drops, intentionally.** The current skill
   guarantees ≥2 error-introducing and ≥2 error-fixing commits; v1 drops that
   guarantee. Per [Downstream
   use](#downstream-use-per-student-question-generation), AI-assisted student
   submissions are realistically clean, so bug-free output is a feature, not a
   gap. If specific grading-tool surfaces (blame diffs across error/fix pairs)
   still need exercised fixtures, address separately via a dedicated "buggy"
   fixture variant rather than forcing bugs into the realistic variant.

2. **Student persona vs. AI fingerprints.** Real student-with-AI code has
   consistent style and good structure — exactly what the grading tool needs to
   handle. Choosing a sub-frontier Coder model (see [Coder model
   selection](#coder-model-selection)) introduces mild imperfections that match
   typical student submissions without any need to dirty the code up
   artificially.

3. **Per-author differentiation via vague work division — highest-risk
   trade-off.** For the question-generation downstream (see [Downstream
   use](#downstream-use-per-student-question-generation)), author X's commits
   should be distinguishable from author Y's in ways a question generator can
   key on. The v1 mechanism — area framing in the prompt to a single Coder —
   may produce no measurable fingerprint, since the same model writing under
   three different area hints can easily converge to one voice. If the
   sign-off gate reveals that, the question-generation downstream is
   undercut and v2 is mandatory, not optional.

   The primary v1 mechanism is **area of responsibility**, not style: during
   planning the Coordinator assigns each of the 3 authors a rough,
   deliberately vague remit (e.g. "parsing and input", "core logic",
   "output and CLI") and stores it in `_plan.json.team[i].area`. Each round's
   prompt nudges the Coder toward the committing author's area — "I'm working
   on the parsing side of this; today I want to …". Realistically, teams don't
   honour their own divisions perfectly, so the Coder is free to touch other
   areas when the task genuinely requires it; that's the same cross-author
   drift covered in trade-off 5 and is itself useful signal. This mirrors how
   real student teams actually start ("you do X, I'll do Y") and gives the
   question-generator natural purchase: *you* wrote the parser, so you should
   be able to explain these parser choices.

   A thinner persona hint ("this student writes terse code" / "this one
   over-comments") can layer on top, but the load-bearing signal is functional
   ownership.

   **v2 escape hatch — per-author Coder instances rotating by commit.** When
   commit `i` is attributed to author X, spawn (or resume via `SendMessage`)
   *author X's* Coder: a distinct Agent with its own persona/style card and
   optionally its own model ID or temperature. Same Coordinator, same
   per-round loop, same serial git flow — the only structural change is
   "spawn author X's Coder" replacing "spawn generic Coder with area hint."
   Persona isolation, not concurrency, is what produces distinguishable
   fingerprints; git commits serialize regardless. Prompt-engineering surface
   grows 3× (three persona definitions), but nothing else changes.

   **v3 territory, only if v2 isn't enough.** Concurrent agents on branches
   with a merge/coordination protocol, or plan-and-negotiate flows where
   agents discuss divisions and review each other. Both are their own
   research project — merge-conflict semantics, coordination protocol design
   — and should not be considered until v2 fingerprints are measured and
   found insufficient.

4. **Commit messages come from the Coder, not the plan.** Students routinely ask
   the AI to write their commit messages; the Coordinator (ignorant of code)
   couldn't judge a good message anyway. Plan's `commits[i].message` becomes a
   **fallback only**, used if the Coder doesn't return a one-liner. This is a
   reversal from the current skill, where planned messages are authoritative.

5. **Cross-author drift is realistic, not a bug.** Nothing stops the Coder from
   editing earlier authors' files in later rounds, which re-attributes some of
   that code. In real shared student repos this happens constantly — teams try
   to separate work and usually fail. Occasional drift gives the downstream
   question-generation feature useful signal ("why did you change X in this
   commit?" where X was originally written by a teammate). The only failure
   mode is *constant* drift that turns attribution into noise; `_review.md`
   surfaces per-round line-delta so the user can spot pathological runs and
   re-run. No in-run enforcement.

## Open questions

1. **Coder isolation.** Should the Coder run in a git worktree (`isolation:
   "worktree"`) per round, with the Coordinator applying the diff into the real
   repo under the planned author/date? That keeps rounds hermetic but adds
   complexity. **Decision for v1:** direct edits; Coordinator stages and
   commits whatever the Coder produced.

2. **How does the Coder know what's already been built?** It starts cold each
   round. **Decision:** Coder reads the repo itself at start — cheap, one `ls` +
   a few `Read` calls, and it's a coding agent so let it explore.

3. **Iteration cost.** Tuning Coordinator prompts means replaying full runs.
   The `--rounds=N` flag on the pnpm script is a first-class deliverable so
   iteration can start at small N (e.g. 3) and ramp up only as quality floors
   are consistently met. Per-run wall-time and token counts (see
   [Deliverables](#deliverables)) let the user decide when/if to switch off
   the `Agent` tool path to nested `claude --model`; no scheduled evaluation
   step is built in.

## Success criteria

Two tiers, both informational. Programmatic checks produce pass/fail signals
recorded in `_review.md`; user review is the qualitative read. Neither blocks
the run from exiting — see [User review](#user-review-qualitative-run-end).

### Programmatic (automated, run-end)

Applied to every run, regardless of N:

- Repo has exactly N commits, authors rotating per plan, dates from plan.
- At least 3 source modules, each > 80 lines at HEAD (applies once N is
  large enough for this to be plausible; at very low N, treat as informational).
- Output passes `python -m py_compile **/*.py` at HEAD.
- Bug/fix cadence is **not** a success criterion — clean output is acceptable
  and expected (see trade-off 1).

### User review (qualitative, run-end)

The run cannot self-verify the downstream motivation — per-author
distinguishability and per-commit substance for question generation. Those
require human judgement, so v1 surfaces them for the user rather than guessing.

There is no automated gate. Each run is self-contained: it writes the repo and
`_review.md`, prints a short summary to stdout, and exits cleanly whether the
programmatic checks pass or fail. Check failures appear as warnings inside
`_review.md`; they do not block the exit or persist state to the next run.

- **`_review.md` artifact.** Written at run end. Metrics-only — no embedded
  diffs and no commit log (the user inspects commits and diffs via `git` /
  GitKraken directly). Contains:
  - Run summary (assignment, N, DIR, totals).
  - Programmatic check results (pass/fail with observed values).
  - Per-round wall time and token usage.

The user's loop: read `_review.md` themselves, optionally ask Claude to read
it for them, then decide the next invocation — re-run at the same N with
edited Coordinator prompts, bump N, or move to the multi-repo variant.
Nothing is carried between runs.

## Deliverables

- `.claude/skills/multi-agent-create-repos/SKILL.md` — the new skill.
- `pnpm create:fixture:multi` — new pnpm script that invokes the same `claude`
  CLI wrapper as `create:fixture` but targets the new skill. Keep
  `create:fixture` working side-by-side for comparison.
- `--rounds=N` flag (or equivalent) on `create:fixture:multi` — the normal
  invocation, not a dry-run mode. Iteration starts at small N (e.g. 3) and
  ramps up as quality floors are consistently met.
- Run-end usage summary: wall time and input/output tokens, per Coder round
  and totalled across the run, printed to stdout and appended to `_review.md`.
  Sourced from the `Agent` tool result usage field; no billing-specific logic.
- `_review.md` artifact generator invoked at the end of every run so the user
  always has a single file to open for qualitative sign-off.
- No code changes outside `.claude/skills/`, `scripts/`, and `package.json`.
