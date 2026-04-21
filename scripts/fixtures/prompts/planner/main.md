You are generating a plan for a synthetic student-team software
assignment. A TypeScript orchestrator will use your plan to drive one
Coder sub-agent per commit.

Output EXACTLY ONE JSON object and nothing else — no prose, no markdown
fences.

Parameters:

- N (build commits): {{rounds}}
- planned commit count: {{planned_count}} (exact; includes both build and review commits)
- C (complexity 1-4): {{complexity}}
- S (students): {{students}}
- today: {{today}}

Kind sequence (use verbatim, in order; do not change any kind):

{{kind_sequence}}

Assignment scope tiers:

- C=1: tiny CLI / parser / single-file utility. 2-3 modules, no tests, no
  packaging.
- C=2: small app with a bit of structure. 3-5 modules, small data/config
  allowed, maybe a handful of pytest cases.
- C=3: multi-module project with real internal boundaries. 5-7 modules
  possibly grouped into a package, persistence or external I/O, a proper
  test file, short README.
- C=4: ambitious student project. Nested package (src/<pkg>/...), 7+
  modules across subpackages, meaningful tests, config loading, CLI entry
  point, README. Includes at least one non-trivial technical concern
  (an algorithm, a concurrency or scheduling problem, a parsing or
  matching task, or an external integration) — not just CRUD + config +
  tests. Still a student codebase — no frameworks, no heavy abstractions.

Avoid these existing directory names: {{existing_dirs}}.

Output JSON shape (comments are for YOU, do not include them in output):

```text
{
  "name": "kebab-case-dir-name",
  "assignment": "One-paragraph assignment description the team will realistically work from",
  "team": [ // exactly {{students}} entries
    {
      "name": "Full Name",
      "email": "user@example.com",
      "area": "coarse remit, overlap allowed",
      "module": "primary_module.py" // use path form (src/<pkg>/foo.py) only at C=4
    }
  ],
  "commits": [ // exactly {{planned_count}} entries, in ascending date order
    {
      "date": "YYYY-MM-DDTHH:MM:SS", // ISO-8601 local, no timezone
      "author_index": 0, // integer in 0..{{max_author}}
      "kind": "build", // "build" or "review"
      "note": "round goal in planner's voice (not the Coder's prompt)",
      "message": "fallback one-liner used only if the Coder fails to produce a commit"
    }
  ]
}
```

Rules:

- team has exactly {{students}} entries with distinct areas and primary
  modules that together cover the assignment's surface. The example above
  shows S=3 illustration only.
- S=1: solo student, every commit has author_index 0.
- Each author appears at least once when N >= S. Distribution is uneven
  but bounded: no author owns more than ~50% of build commits, none owns
  fewer than ~15%. A typical S=3/N=10 split is 4/3/3 or 4/4/2, not 7/2/1.
- Commit dates spread realistically across 1-2 weeks ending on or before
  today. Pacing is uneven: some days have no commits, some have 2-3,
  weekends are plausible but lighter. Avoid exactly one commit per day.
  Pace them against the planned count so an early stop still leaves
  realistic density.
- Each commit is one coherent change. If a note reads "X and Y" where X
  and Y are different concerns, split them into two commits.
- The "kind" field of each commit is fixed by the Kind sequence above;
  emit the commits in that exact order with those exact kinds. Do not
  reorder, merge, split, or change any kind.
- For each "review" commit, the note re-examines recent work rather than
  adds a feature ("take another look at the parser, clean up rough
  edges", "look over the CSV import and fix anything that feels off").
  Assign every review commit to an author different from the one who
  wrote the immediately preceding build commit — a teammate looking over
  someone else's work, not the original author.
- "note" is the round goal in the planner's voice (used to compose the
  Coder prompt). "message" is a fallback commit message used only if the
  Coder doesn't return one.
- No file lists, no file-count caps, no planned error/fix pairs: the
  Coder decides file structure, and planted errors harm realism.

Output only the JSON object.
