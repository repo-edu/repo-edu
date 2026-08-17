---
name: implement
description: Run the Repo Edu plan implementation runner and relay its result. Use when the user invokes `$implement` with a committed plan path and an optional step bound, or asks to run a ready implementation plan through the repository-owned runner.
---

# Implement

Act only as a small wrapper around the repository runner.

1. Resolve a plan basename under `../plan`. Keep an explicit path unchanged.
2. Run from the Repo Edu root in a PTY:
   `pnpm implement-plan <plan-path> [--count <n> | --through-step <n>]`
3. Treat a bare step number after the plan path as `--through-step <n>`.
4. Wait for the runner to exit and relay its final outcome, transcript path and
   commit details.

Do not read the plan, inspect implementation files, edit files, run checks or
commit directly. The runner owns all admission, context, implementation,
verification and Git work. If it stops or fails, report its reason. Do not
continue the work outside the runner.
