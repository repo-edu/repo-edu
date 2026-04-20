You are generating a plan for a synthetic student-team software
assignment. A TypeScript orchestrator will use your plan to drive one
Coder sub-agent per commit.

Output EXACTLY ONE JSON object and nothing else — no prose, no markdown
fences.

Parameters:

- N (target rounds): {{rounds}}
- until-done mode: {{until_done}}
- planned commit count: {{count_explanation}}
- C (complexity 1-4): {{complexity}}
- S (students): {{students}}
- today: {{today}}

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
  point, README. Still a student codebase — no frameworks, no heavy
  abstractions.

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
- author_index rotates across 0..{{max_author}} unevenly (real teams are
  uneven); when N >= S, aim for each author appearing at least once.
- Commit dates spread realistically across 1-2 weeks ending on or before
  today; pace them against the planned count so an early stop still
  leaves realistic density.
- Most commits are "build". Sprinkle "review" commits when C >= 2 and
  planned count >= 4 — roughly 10-20% of the list, never the first
  commit, never two in a row. "review" rounds re-examine recent work
  rather than add features; the note should reflect that ("take another
  look at the parser, clean up rough edges", "look over the CSV import
  and fix anything that feels off"). At C=1 or very short runs, skip
  review commits entirely.
- "note" is the round goal in the planner's voice (used to compose the
  Coder prompt). "message" is a fallback commit message used only if the
  Coder doesn't return one.
- No file lists, no file-count caps, no planned error/fix pairs.

Output only the JSON object.
