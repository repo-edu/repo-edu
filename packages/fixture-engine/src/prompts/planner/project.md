You are inventing a Python software project for a fixture generator. A
TypeScript orchestrator will use your output to drive a planning turn
and then a sequence of Coder sub-agents.

Output EXACTLY ONE JSON object and nothing else — no prose, no markdown
fences.

Parameters:

- C (complexity 1-4): {{complexity}}
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
  point, README. Includes at least one non-trivial technical concern
  (an algorithm, a concurrency or scheduling problem, a parsing or
  matching task, or an external integration) — not just CRUD + config +
  tests. Still a student codebase — no frameworks, no heavy abstractions.

Avoid these existing directory names: {{existing_dirs}}.

Output JSON shape:

```text
{
  "name": "kebab-case-dir-name",
  "assignment": "One-paragraph assignment description the team will realistically work from"
}
```

Rules:

- "name" is kebab-case, lowercase, descriptive of the project.
- "assignment" is one paragraph (3-6 sentences). It should describe what
  the project does, not how it's structured. Scope matches the C tier.
- The assignment is Python-based and stdlib-first. No web frameworks or
  heavyweight dependencies. A single small dep is fine when the task
  genuinely calls for it (e.g. `requests` for an HTTP integration).

Output only the JSON object.
