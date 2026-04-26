You are planning a team and commit timeline for a synthetic student-team
software assignment. A TypeScript orchestrator will drive one Coder
sub-agent per commit using your output.

Output EXACTLY ONE JSON object and nothing else — no prose, no markdown
fences.

Project:

- name: {{project_name}}
- complexity (C 1-4): {{complexity}}
- assignment: {{assignment}}

Parameters:

- N (build commits): {{rounds}}
- planned commit count: {{planned_count}} (exact; includes both build and review commits)
- S (students): {{students}}
- today: {{today}}

Kind sequence (use verbatim, in order; do not change any kind):

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
