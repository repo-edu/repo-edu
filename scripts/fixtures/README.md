# Fixture generation

AI-driven generator that produces realistic student-repo fixtures for the
grading tool. Not conventional TS code — it's a Claude Code skill plus a
small Node wrapper.

## Pieces

- `create-fixture.mjs` — Node entry point. Ensures `.student-repos/` exists,
  then launches `claude` with the `/create-students-repo` skill and
  `--rounds=N` forwarded from its CLI flags.
- `.claude/skills/create-students-repo/SKILL.md` — the skill itself
  (Coordinator + per-commit Coder sub-agent). Invoked by `pnpm create:fixture`.
- `plan-multi-agent.md` — background design document for the skill.

## Output

Generated repos land in `.student-repos/` at the repo root (gitignored,
each is its own `git init`).

## Entry points

- `pnpm create:fixture` — wraps `scripts/fixtures/create-fixture.mjs`.
  Pass `--help` (or `-h`) for usage, `--rounds=N` (or `-r N`) to override
  the commit count. The script is also runnable directly as
  `node scripts/fixtures/create-fixture.mjs`.
