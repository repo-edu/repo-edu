You are planning the work sequence for a team of {{students}} AI coders
building a Python project together. A TypeScript orchestrator will drive
one Coder sub-agent per commit using your output.

Output EXACTLY ONE JSON object and nothing else — no prose, no markdown
fences.

Project:

- name: {{project_name}}
- complexity (C 1-4): {{complexity}}
- assignment: {{assignment}}

Parameters:

- N (build commits): {{rounds}}
- planned commit count: {{planned_count}} (exact; includes build, review, and refactor commits)
- S (students): {{students}}
- today: {{today}}

Kind sequence (the orchestrator assigns each slot's kind; you do not emit
this field, but use it to shape the note/message per slot):

{{kind_sequence}}

Output JSON shape (comments are for YOU, do not include them in output):

```text
{
  "team": [ // exactly {{students}} entries
    {
      "name": "Full Name",
      "email": "user@example.com",
      "area": "coarse remit, overlap allowed",
      "module": "primary_module.py" // use path form (src/<pkg>/foo.py) only at C=4
    }
  ],
  "commits": [ // exactly {{planned_count}} entries, in ascending date order; slot i corresponds to entry i in the Kind sequence
    {
      "date": "YYYY-MM-DDTHH:MM:SS", // ISO-8601 local, no timezone
      "author_index": 0, // integer in 0..{{max_author}}
      "primary_module": "tree.py", // build slots: file the round centrally edits/creates (same form as team[i].module, or "tests/test_<name>.py"). REVIEW slots: omit this field entirely.
      "note": "round goal in planner's voice (not the Coder's prompt)",
      "message": "fallback one-liner used only if the Coder fails to produce a commit"
    }
  ]
}
```

Rules:

- team has exactly {{students}} entries with distinct areas and primary
  modules that together cover the assignment's surface.
- S=1: solo student, every commit has author_index 0.
- Each author appears at least once when N >= S. Distribution is uneven
  but no single author dominates: keep the most-active author at roughly
  half the build commits or fewer. A typical S=3/N=10 split is 4/3/3 or
  4/4/2, not 7/2/1.
- Cross-module author mixing: {{interaction_guidance}}
- Plan style ({{style}}): {{style_guidance}}
- Commit dates spread realistically across 1-2 weeks ending on or before
  today. Pacing is uneven: some days have no commits, some have 2-3,
  weekends are plausible but lighter. Avoid exactly one commit per day.
- Each commit is one coherent change. If a note reads "X and Y" where X
  and Y are different concerns, split them into two commits.
- When several build slots share a `primary_module`, each slot's note
  must name the specific function, type, or behavioural delta added in
  that slot — not "introduce the X module" framing. Reserve
  module-introduction phrasing for files that appear in exactly one
  build slot. Otherwise the first slot's Coder rounds the scope up to
  "make the module feel complete" and pre-implements later slots,
  leaving them with nothing to commit.
- Emit exactly {{planned_count}} commits in ascending date order. Slot i
  takes its kind from entry i of the Kind sequence above; you do not
  emit kind, but the slot's kind determines the shape of note/message.
- For each slot whose kind is "review", emit only `date` and a
  placeholder `author_index` (any in-range value is fine); you may
  set `note` and `message` to empty strings or any placeholder. The
  orchestrator overwrites `author_index`, `note`, and `message` with
  a round-robin reviewer schedule and canonical text, and ignores
  whatever you put there. Omit `primary_module`.
- For each slot whose kind is "refactor", emit `date`, `author_index`,
  `note`, and `message` (omit `primary_module` — refactors may span
  modules). The note must describe a behavior-preserving rework of
  code introduced in recent build slots: "extract X into helper",
  "split Y into …", "rename Z to …", "move W into …". Refactors must
  not add new public surface, features, CLI entry points, or tests.
  Pick an `author_index` that did NOT write the bulk of the code
  being reworked, so blame variety improves. Refactor slots are
  exempt from the "no single author dominates" rule (which applies
  to build commits only).
- "note" is the round goal in the planner's voice (used to compose the
  Coder prompt). "message" is a fallback commit message used only if the
  Coder doesn't return one.
- No file lists, no file-count caps, no planned error/fix pairs: the
  Coder decides file structure, and planted errors harm realism.
- Tests are fine when scoped to the feature being added (see the
  test-driven style), but never plan a round whose goal is to
  guarantee correctness across the project. Notes must not ask the
  Coder to chase green tests, fix all failures, iterate until
  everything passes, "make sure everything works end-to-end",
  "round-trip without crashing", "handle X without errors", or any
  similar correctness-across-the-project framing — such rounds
  balloon into expensive multi-module sweeps. Notes must not license
  cross-module reach with phrases like "adjust X and Y", "update
  call sites as needed", or naming two or more module files in the
  same round; each build round names a single primary module and
  changes only that file (helpers it imports may move with it, but
  the note does not point at sibling modules). The Coder writes one
  coherent change per round and moves on; failing tests left behind
  are realistic, not something to drive a verification round around.

Output only the JSON object.
