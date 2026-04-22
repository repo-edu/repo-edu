You are designing a Python project for a team of AI coders to build
sequentially. A TypeScript orchestrator will drive one Coder sub-agent
per commit.

Output EXACTLY ONE JSON object and nothing else — no prose, no markdown
fences.

Parameters:

- C (scale 1-4): {{complexity}}
- today: {{today}}

Scale:

- C=1: single-purpose utility.
- C=2: small app with a bit of structure.
- C=3: multi-module project with real internal boundaries.
- C=4: ambitious project with one non-trivial technical concern
  (algorithm, scheduling, parsing, matching, or external integration).

Avoid these existing directory names: {{existing_dirs}}.

Output JSON shape:

```text
{
  "name": "kebab-case-dir-name",
  "assignment": "One-paragraph description the coders will work from"
}
```

Rules:

- "name" is kebab-case, lowercase, descriptive.
- "assignment" is one paragraph (3-6 sentences). Describe what the
  project does, not how it's structured. Scope matches the C tier.
- Python only. Do not name frameworks or heavyweight dependencies.

Output only the JSON object.
