---
name: create-students-repo
description: Simulate an AI-assisted student team by having a Coordinator thread drive a Coder sub-agent for each commit. Produces one fixture repo per run under `.student-repos/`. Triggers on `/create-students-repo`.
---

You are the **Coordinator** for a multi-agent fixture-generation run. You own
the plan, stage commits, and record the run. You DO NOT write production code
yourself — code comes from a **Coder** sub-agent you spawn per commit.

PREREQUISITES:

- Your current working directory is `.student-repos/` in the repo-edu project. All paths below are relative to this cwd.
- Parse invocation arguments for `--rounds=N`. Default `N = 3` when absent. `N` is the exact number of commits the run will produce.

COORDINATOR IGNORANCE — THIS IS A REALISM CONSTRAINT, NOT A SHORTCUT:

- You may run `git status`, `git diff --stat`, `git log`, `wc -l`, `ls`, and read file paths / counts / sizes.
- You may read the Coder's self-reported commit message and summary.
- You MUST NOT read source file contents during the per-commit loop.
- You MUST NOT parse diffs to judge which changes matter.

The wrapper script (`scripts/fixtures/create-fixture.mjs`) has already cleared
any stale `_plan.json`, `_state.json`, and `_review.md` from a previous run
before invoking you. Do not repeat that cleanup. Do not touch sibling
directories.

═══════════════════════════════════════════════════════════════════════════════
PHASE 1 — PLANNING
═══════════════════════════════════════════════════════════════════════════════

1. List sibling directories in cwd (`ls -1`, skip entries starting with `.` or `_`) to collect `existing_dirs` — names to avoid when naming the new fixture.
2. Invent a unique assignment idea not in `existing_dirs`. Pick a small Python project (CLI tool, parser, small utility). Examples: `weather-api-client`, `markdown-parser`, `inventory-tracker`, `chat-log-analyzer`, `recipe-scaler`, `playlist-shuffler`.
3. Write `_plan.json` with this exact structure:

```json
{
  "name": "directory-name",
  "assignment": "One-paragraph assignment description the team will realistically work from",
  "team": [
    {"name": "Full Name", "email": "user@example.com", "area": "parsing and input", "module": "parser.py"},
    {"name": "Full Name", "email": "user@example.com", "area": "core logic", "module": "core.py"},
    {"name": "Full Name", "email": "user@example.com", "area": "output and CLI", "module": "cli.py"}
  ],
  "commits": [
    {
      "date": "2026-04-10T14:30:00",
      "author_index": 0,
      "note": "What the committing student is trying to achieve this round",
      "message": "fallback one-liner (used only if the Coder fails to return one)"
    }
  ]
}
```

PLAN RULES:

- Exactly `N` entries in `commits`.
- Dates spread realistically across 1–2 weeks ending on or before today.
- `author_index` rotates across 0/1/2 but not mechanically — real teams are uneven. Aim for each author appearing at least once when `N >= 3`.
- `team[i].area` is a rough, deliberately vague remit per author. Keep areas coarse; overlap is fine.
- `team[i].module` is the author's **primary** Python module within the project — the file they mostly work in. Invent module names that fit the assignment (e.g. `lexer.py`, `parser.py`, `renderer.py` for a markdown parser; `storage.py`, `streaks.py`, `cli.py` for a habit tracker). Ownership is not exclusive: teammates touch other modules when a change genuinely belongs there, but the team should not end up with every commit editing the same single file.
- `note` is the round goal in the planner's voice, NOT the Coder's prompt. You will rewrite it into a student-voice prompt at run time.
- `message` is a fallback only. The Coder's self-reported one-liner wins at commit time.
- No file lists, no file-count caps, no planned error/fix pairs. Clean output is expected.

STOP. Write `_plan.json`. Do not proceed to Phase 2 until the file exists.

═══════════════════════════════════════════════════════════════════════════════
PHASE 2 — EXECUTION (one round per commit)
═══════════════════════════════════════════════════════════════════════════════

Let `DIR` be `_plan.json.name`. Create it and initialise:

```bash
mkdir -p DIR
git -C DIR init --template=''
```

The shared working-agreements file lives alongside this skill at
`.claude/skills/create-students-repo/CODER.md`. It is source-controlled and
the same for every run and every persona — per-round instructions (who does
what this commit) come through the prompt. The Coordinator does not write
or copy it; the Coder reads it directly from its checked-in location.

Initialise `_state.json`:

```json
{
  "commit_index": 0,
  "rounds": []
}
```

The Coordinator is a thin orchestrator in this phase: it composes prompts,
spawns Coders, and records what came back. **The Coder stages and commits its
own work.** The Coordinator does not run `git add` / `git commit`, does not
verify the Coder's commit, and does not retry or flag failed rounds. Whatever
the git log shows at the end is what the student team "produced"; occasional
missing or mis-authored commits are realistic student output and surface as
`WARN` lines in Phase 3, not errors.

For each commit `i` in `_plan.json.commits`, in order:

1. Gather context for the Coder prompt (no source reading):
   - `abs_path` — absolute path to `DIR`.
   - `coder_md` — absolute path to `.claude/skills/create-students-repo/CODER.md` (resolve once at start of Phase 2 via `realpath`; reuse across rounds).
   - `round_goal` — `commits[i].note`, rephrased by you into student voice.
   - `area_hint` — `team[commits[i].author_index].area`.
   - `module` — `team[commits[i].author_index].module` (the author's primary file).
   - `persona` — `team[commits[i].author_index]` (name + email).
   - `date` — `commits[i].date` (ISO-8601 local, no timezone).

2. Compose a **student-style prompt** for the Coder. The prompt carries persona
   and date so the Coder can commit under the right identity. Template (fill
   in, vary register):

   > I'm {persona.name} <{persona.email}>, working on a small Python assignment with two teammates: {assignment}. The repo is at {abs_path}.
   >
   > Please read `{coder_md}` first — it's the working agreement we all share.
   >
   > I'm on the {area_hint} side of this, so I mostly work in `{module}`. Touch other files if it genuinely makes sense for this change, but don't rewrite someone else's module. Right now I want to {round_goal}.
   >
   > Please edit the files and make it work. Keep it simple — this is a student project, don't over-engineer. {occasional: can you add a comment explaining what you did.}
   >
   > When you're done, stage and commit your work with:
   >
   > ```bash
   > git -C {abs_path} add -A
   > GIT_AUTHOR_NAME="{persona.name}" GIT_AUTHOR_EMAIL="{persona.email}" GIT_AUTHOR_DATE="{date}" \
   > GIT_COMMITTER_NAME="{persona.name}" GIT_COMMITTER_EMAIL="{persona.email}" GIT_COMMITTER_DATE="{date}" \
   > git -C {abs_path} commit -m "<your one-line message>"
   > ```
   >
   > Use a short, imperative-mood subject line (≤ 72 chars, no trailing period), like you'd write for a real git commit. If there's nothing to commit, just say so and stop.

   Voice register varies per round: mostly first-person informal, occasionally terse, once or twice sloppy (e.g. "fix the thing that broke"). The Coder doesn't need to know it's playing a simulation — it's being asked to work on and commit a real-looking task.

3. Spawn the Coder via the `Agent` tool:
   - `subagent_type`: `general-purpose`
   - `model`: `haiku` (starting default; see MODEL TUNING below)
   - `description`: short, e.g. `"Student round {i}"`.
   - `prompt`: the composed student prompt.
   - Run in foreground — commits are serial.

4. Record what came back. Do NOT run `git` commands, do NOT verify the commit,
   do NOT retry. Append to `_state.json.rounds`:

   ```json
   {
     "commit_index": i,
     "author_index": {author_index},
     "coder_summary": "first paragraph of the Coder's reply, trimmed",
     "usage": {"input_tokens": N, "output_tokens": N, "wall_ms": N}
   }
   ```

   `usage` comes from the `Agent` tool result.

5. Increment `commit_index`. Persist `_state.json` after every round so a crash leaves it inspectable.

═══════════════════════════════════════════════════════════════════════════════
PHASE 3 — REVIEW (`_review.md`)
═══════════════════════════════════════════════════════════════════════════════

Write `_review.md` in cwd at run end. It is a metrics-only artifact — no
embedded diffs, no commit log, no pass/fail gates. Whether the generated repo
is suitable is a qualitative judgement the user makes by inspecting the repo
in `git` / GitKraken; trivial programmatic checks here would only give a false
sense of security. Sections, in order:

1. **Run summary** — assignment name, `N`, DIR, total wall time, total input/output tokens.
2. **Per-round usage table** — `#i | wall_ms | input_tokens | output_tokens | coder_summary (first line)`.

Then print a short stdout summary:

```text
Wrote DIR/ (see git log for contents). Review: .student-repos/_review.md
Wall time: X s | tokens in/out: A / B
```

Do not delete any working files. The wrapper script clears them before the next invocation.

═══════════════════════════════════════════════════════════════════════════════
MODEL TUNING
═══════════════════════════════════════════════════════════════════════════════

The Coder model is `haiku` as a starting default. The `Agent` tool's `model`
field takes family aliases (`haiku` / `sonnet` / `opus`). If, after running at
low `N`, output is consistently too thin or too polished, the user edits this
file to swap the alias.

Version pinning (e.g. an older Haiku release) is NOT available through the
`Agent` tool in this environment. If version-level tuning becomes necessary,
fall back to a nested `claude --model <id>` invocation via Bash. That is a v2
concern — do not build it now.

═══════════════════════════════════════════════════════════════════════════════
NON-GOALS FOR v1
═══════════════════════════════════════════════════════════════════════════════

- No retry, rollback-and-re-prompt, or in-run quality gates. Occasional Coder failures (no commit, wrong author, empty output) are realistic student output; they are visible to the user through `git log` / GitKraken inspection of the generated repo.
- No file-count caps on the Coder. Big changes in few files and small changes in many files are both acceptable.
- No planted bugs, no forced error/fix cadence. Clean output is the target.
- No Coordinator reading of source files during the per-commit loop.
- No cross-run state. `_review.md`, `_state.json`, and `_plan.json` persist in cwd until the next run, then are wiped by the wrapper script.
