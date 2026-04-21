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

## Commits

- Short imperative subject, ≤ 72 chars, no trailing period.
- One logical change per commit.
- Stage and commit with the exact author/date the prompt gives you.
- Don't commit `.venv/`, `__pycache__/`, `.pytest_cache/`, `.DS_Store`,
  or editor/IDE files. If no `.gitignore` is present when you first touch
  the repo, add one covering these paths.

## Review rounds

Sometimes the prompt will ask you to look back at what's been committed
rather than add new functionality. Run `git log --oneline` and read the
recent work the round goal points at, then decide — as a real student
would — whether something needs fixing or cleaning up. If yes, fix it
and commit. If no, say so and don't commit anything. It's fine for a
review round to end without a commit; that's a realistic student "I
looked, it's fine" moment.
