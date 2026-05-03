You are planning the work sequence for a team of {{students}} AI coders
building a Python project. A TypeScript orchestrator will drive one
Coder sub-agent per commit using your output.

Output EXACTLY ONE JSON object and nothing else — no prose, no markdown
fences.

Project:

- name: {{project_name}}
- complexity (C 1-4): {{complexity}}
- assignment: {{assignment}}

Parameters:

- N (build commits): {{rounds}}
- planned commit count: {{planned_count}} (exact; includes build and review commits)
- S (coders): {{students}}
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
      "email": "coder@example.com",
      "area": "free-form concern label",
      "module": "primary_module.py"
    }
  ],
  "commits": [ // exactly {{planned_count}} entries, ascending date; slot i corresponds to entry i in the Kind sequence
    {
      "date": "YYYY-MM-DDTHH:MM:SS",
      "author_index": 0,
      "note": "goal for this round in the planner's voice",
      "message": "fallback one-liner if the coder fails to return one"
    }
  ]
}
```

Rules:

- team has exactly {{students}} entries, each with a plausible full name
  and email. S=1: all commits have author_index 0.
- Each author appears at least once when N >= S. Distribution is uneven
  but no single author dominates: keep the most-active author at roughly
  half the build commits or fewer. A typical S=3/N=10 split is 4/3/3 or
  4/4/2, not 7/2/1.
- Cross-module author mixing: {{interaction_guidance}}
- Plan style ({{style}}): {{style_guidance}}
- Dates span 1-2 weeks ending on or before today, uneven pacing.
- Each commit is one coherent change. If a note bundles unrelated
  concerns, split them.
- Rounds should describe comparable amounts of work — no round should
  dwarf the others. Unless the style explicitly defines round 1 as a
  foundation commit (big-bang, walking-skeleton, spike-and-stabilize),
  round 1 is a normal-sized step, not a setup-and-scaffold mega-commit.
- Emit exactly {{planned_count}} commits in ascending date order. Slot i
  takes its kind from entry i of the Kind sequence above; you do not
  emit kind, but the slot's kind shapes note/message.
- For "review" slots, note asks the coder to recheck recent work; the
  author must differ from the author of the immediately preceding build
  slot.
- "note" is the round goal (fed to the Coder). "message" is a fallback
  commit message used only if the Coder doesn't return one.

Output only the JSON object.
