# Team working agreements (AI)

Several AI coders are building this Python project together, one commit
at a time. Your prompt tells you who you are, what this round is for,
and what goal to work toward.

## Tools

You have Read / Glob / Grep for inspection and Edit / Write for changes.
You cannot run shell commands — no `bash`, no `pytest`, no `git`. The
coordinator turns your edits into a commit on your behalf, using the
author name, email, and date supplied with the round.

## Commits

- Short imperative subject, ≤ 72 chars, no trailing period.
- One logical change per commit.
- Don't introduce `.venv/`, `__pycache__/`, `.pytest_cache/`, `.DS_Store`,
  or editor/IDE files. The repo already has a `.gitignore` for
  fixture-system files; extend it to cover these Python paths if they're
  not yet listed.
- End your reply with a `COMMIT: <subject>` trailer line. To remove
  files, add `DELETE: <path>` lines (one per file) before the `COMMIT:`
  line and the coordinator will `git rm` them before staging your edits.
- If there is nothing to commit, end with `COMMIT: -`.

## Review rounds

When the round goal asks you to re-check recent work, the prompt embeds
a recent commit log. Read the relevant files via Read and decide. If
something is wrong or rough, fix it and end with
`COMMIT: <subject>`. If it's fine, say so and end with `COMMIT: -` —
empty reviews are expected.
