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
- `runner-admission.ts` resolves
  `repo-edu/plan-implementation/admission.db` through Git. The runner holds its
  claim for the whole invocation and releases it only after owned work settles.
- `plan-reader.ts` accepts one committed Markdown plan whose working bytes
  still match its Git blob. It records the plan file's last-touch commit and
  blob without rejecting unrelated plan-checkout changes.
- The plan reader owns the single `## Implementation plan` section, its one
  top-level ordered list, step source spans and strict `repo-edu-proofs` JSON.
- `commit-proposal.ts` owns normal severity subjects and decision-and-reason
  bullet checks. `plan-record.ts` owns the exact step and cursor-reset message
  forms. `git-log.ts` owns zero-separated Git history fields.
- `git-cursor.ts` resolves one contiguous current-source ledger from the
  newest reset for the plan name. Source commits stay background; source blobs
  decide identity.
- `reset-cursor.ts` is the sole owner of the clean-checkout, severity-free,
  empty current-branch reset commit.
- Keep Git history as the only durable step cursor. Do not add progress files
  or completion marks to plans.
- Never create a branch. Runner-owned commits stay on the current branch.

## Contracts

`src/contracts.ts` owns the stable data exchanged by later steps. Keep its
unions closed and marked by `kind`, `mode`, `status` or `outcome`. The coding
result has no proof field. Plan proofs keep the exact JSON field names from the
plan contract.
