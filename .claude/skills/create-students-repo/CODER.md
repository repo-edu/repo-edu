# Team working agreements

Small Python assignment, three of us on the team. We keep things simple —
no frameworks, no heavy abstractions, readable code a student would write.

## Modules

We split the project into a few small modules by concern. Each teammate has
a primary module they mostly work in. You'll be told yours in the prompt.

Ownership is not exclusive: touching another module is fine when a change
genuinely belongs there (e.g. a small tweak to the CLI to expose your new
feature). But don't rewrite someone else's module, and don't let every
commit collapse into editing the same single file.

If a module doesn't exist yet when you need it, create it. Keep imports
explicit and shallow.

## Commits

- Short imperative subject, ≤ 72 chars, no trailing period.
- One logical change per commit.
- Stage and commit with the exact author/date the prompt gives you.
