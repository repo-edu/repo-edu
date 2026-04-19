# Fixture generation

AI-driven generator that produces realistic student-repo fixtures for the
grading tool. Not conventional TS code — it's a Claude Code skill plus a
small Node wrapper.

## Pieces

- `create-fixture.mjs` — Node entry point. Ensures `.student-repos/` exists,
  then launches `claude` with the `/create-students-repo` skill, forwarding
  `--rounds=N` and `--model=ID` from its CLI flags. The Coordinator defaults
  to Sonnet; the Coder sub-agent's model is set inside the skill itself.
- `.claude/skills/create-students-repo/SKILL.md` — the skill itself
  (Coordinator + per-commit Coder sub-agent). Invoked by `pnpm create:fixture`.
- `plan-multi-agent.md` — background design document for the skill.

## Output

Generated repos land in `.student-repos/` at the repo root (gitignored,
each is its own `git init`).

## Entry points

- `pnpm create:fixture` — wraps `scripts/fixtures/create-fixture.mjs`.
  Pass `--help` (or `-h`) for usage, `--rounds=N` (or `-r N`) to override
  the commit count, and `--model=ID` (or `-m ID`) to override the
  Coordinator model (default `sonnet`). The script is also runnable
  directly as `node scripts/fixtures/create-fixture.mjs`.
