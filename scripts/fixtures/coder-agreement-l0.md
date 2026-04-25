# Team working agreements (L0)

Several AI coders are building this Python project together, one commit
at a time. Your prompt tells you who you are, what this round is for,
and what goal to work toward.

## Commits

- Short imperative subject, ≤ 72 chars, no trailing period.
- One logical change per commit.
- Stage and commit with the exact author/date the prompt gives you.
- Don't commit `.venv/`, `__pycache__/`, `.pytest_cache/`, `.DS_Store`,
  or editor/IDE files. The repo already has a `.gitignore` for
  fixture-system files; extend it to cover these Python paths if they're
  not yet listed.

## Review rounds

When the round goal asks you to re-check recent work, read the relevant
commits via `git log --oneline`. If something is wrong or rough, fix and
commit. If it's fine, say so and don't commit — empty reviews are OK.
