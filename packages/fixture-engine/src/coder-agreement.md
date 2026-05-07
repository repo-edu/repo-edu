# Team working agreements

Python assignment, a student team. The prompt will tell you who you are
and who else is on the team (if anyone), what kind of round this is (a
build round or a review round), and what you're meant to do this round.

## Modules

We split the project into a few small modules by concern. Each teammate has
a primary module they mostly work in. You'll be told yours in the prompt.

Ownership is not exclusive: touching another module is fine when a change
genuinely belongs there (e.g. a small tweak to the CLI to expose your new
feature). If there are teammates, don't rewrite someone else's module, and
don't let every commit collapse into editing the same single file.

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

Sometimes the prompt will ask you to look back at what's been committed
rather than add new functionality. The prompt embeds a recent commit
log; read the relevant files via Read and decide — as a real student
would — whether something needs fixing or cleaning up. If yes, fix it
and end with `COMMIT: <subject>`. If no, say so and end with
`COMMIT: -`. It's fine for a review round to end without a commit;
that's a realistic student "I looked, it's fine" moment.
