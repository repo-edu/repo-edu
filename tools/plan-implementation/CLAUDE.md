# CLAUDE.md

This is the private plan implementation tool
(`@repo-edu/plan-implementation`). It will run one committed plan from the
sibling plan checkout against the current Repo Edu checkout. It never ships in
the desktop app or the compiled command-line product.

## Ownership

- One deterministic runner owns admission, step selection, checks, commits and
  the Git cursor.
- One fresh Codex context owns code reasoning and edits for one marked step.
- Plan proof blocks own extra machine proofs and user actions. A coding result
  never carries proof choices.
- Presentation reads semantic events. It cannot move runner state and may only
  request a stop.

## Boundaries

- Keep all tool source in the `tool-plan-implementation` primary area.
- No source outside this tool may import its source. The architecture check
  enforces this private boundary.
- Use shared host-node admission and child-lifetime parts only through their
  narrow subpaths. Do not duplicate their policy in this tool.
- Keep Git history as the only durable step cursor. Do not add progress files
  or completion marks to plans.
- Never create a branch. Runner-owned commits stay on the current branch.

## Contracts

`src/contracts.ts` owns the stable data exchanged by later steps. Keep its
unions closed and marked by `kind`, `mode`, `status` or `outcome`. The coding
result has no proof field. Plan proofs keep the exact JSON field names from the
plan contract.
