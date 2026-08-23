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

## Outside work

Outside work is planned or ad hoc work that is not part of and does not affect
the active plan. `repository-admission.ts` owns its practical admission rule:
outside work stays on the same branch, keeps the admitted `HEAD` in its own
history, leaves the index unchanged and has no path in common with the active
step. Keeping the admitted `HEAD` in history admits a merge commit and rejects
rewritten history. `plan-runner.ts`
keeps the active plan cursor fixed and repeats dependency installation and
checks after it admits outside work. These facts are practical evidence. The
runner does not try to prove the meaning of the work.

## Boundaries

- Keep all tool source in the `tool-plan-implementation` primary area.
- No source outside this tool may import its source. The architecture check
  enforces this private boundary.
- Use shared host-node admission and child-process lifetime parts only through
  their narrow subpaths. Do not duplicate their policy in this tool.
- The runner is a developer-only tool for macOS and Linux. It never runs on
  Windows, so it never supplies the Windows child-process lifetime adapter.
  The `developer-tool-platforms` boundary in `../plan/BOUNDARIES.md` records
  that decision.
- `runner-admission.ts` resolves
  `repo-edu/plan-implementation/admission.db` through Git. The runner holds its
  claim for the whole invocation and releases it only after owned work settles.
- `plan-reader.ts` accepts one committed Markdown plan whose working bytes
  still match its Git blob. It records the plan file's last-touch commit and
  blob without rejecting outside work in the plan checkout.
- The plan reader owns the single `## Implementation plan` section, its one
  top-level ordered list, step source spans and strict `repo-edu-proofs` JSON.
- `commit-proposal.ts` owns normal severity subjects and decision-and-reason
  bullet checks. `plan-record.ts` owns the exact step, cursor-reset and
  completion message forms. `git-log.ts` owns zero-separated Git history
  fields.
- `git-cursor.ts` resolves one contiguous current-source ledger from the
  newest reset for the plan name, including its one terminal completion
  marker. Source commits stay background; source blobs decide identity.
- `reset-cursor.ts` is the sole owner of the clean-checkout, severity-free,
  empty current-branch reset commit.
- `coding-adapter.ts` launches the official `@openai/codex` JavaScript entry
  with `app-server` for each step through the shared child-process lifetime
  controller. It composes one fresh app-server connection, thread and turn.
  It reports protocol facts and never ranks or composes run failures. The
  shared controller chooses unknown, cancelled, failed or completed after tree
  confirmation, except that confirmation expiry chooses unknown directly.
- `codex-app-server-connection.ts` owns JSON-lines connection startup,
  initialization, the installed capability policy, thread start, effective
  review settings and bounded error output. The installed-message contract
  test generates the current app-server description and checks every consumed
  protocol name during the package check.
- `codex-app-server-turn.ts` owns one turn request, structured-result
  admission, interruption and the facts reported to the child-process lifetime
  controller. `codex-app-server-events.ts` maps protocol notifications into
  semantic coding events without exposing raw reasoning or app-server types.
- `codex-app-server-review.ts` owns server-request correlation, protocol reply
  conversion, cleared-request handling and safe refusal. `human-review.ts`
  owns one serialized attended terminal prompt and returns semantic decisions.
  Automatic review remains app-server-owned; human review answers only the
  request forms this runner supports.
- `coding-prompt.ts` gives Codex the complete committed plan with one
  parser-owned active-step marker. It permits Repo Edu writes, needed
  dependency installation, package checks and focused tests while forbidding
  plan, Git and later-step writes and root checks. Work that depends on an
  external API, package or tool must use live search, open the selected source
  and never use a search-result snippet as evidence.
- `CodingResult` is the app-server turn's only admitted terminal payload. Keep
  its succeeded and blocked forms strict and never add proof data to it.
- `repository-admission.ts` fixes the clean branch and index before Codex. It
  owns outside work admission under the rule above. It freezes `HEAD` before
  staging and owns the non-empty path set, complete staging, exact step commit
  and empty completion marker.
- `step-check-scope.ts` maps admitted paths to pnpm workspace projects and
  their dependants. It selects root checks when package ownership cannot be
  proved or the active step is final.
- `step-checks.ts` alone runs dependency install, scope discovery, the selected
  package or root checks and ordered machine proofs. Every command uses its
  program and arguments without a shell.
- `plan-source-admission.ts` rechecks the working plan and source blob before
  each commit and later coding context.
- `plan-runner.ts` joins these owners through the pure run reducer. It keeps the
  active plan cursor fixed and repeats final checks after outside work. It
  starts a later context only after an exact commit and a clean checkout. It
  writes a missing completion marker only after the exact cursor reaches one
  past the final step.
- `run-lifetime.ts` turns one stop signal into reducer admission closure, Codex
  abort and shared stop-and-confirm for every Codex and check tree.
- `run-progress.ts` turns runner facts into the one ordered semantic event
  stream. `transcript.ts` writes every event under the Git administrative
  directory. `coding-command-display.ts` decodes shell wrappers for display
  without running them and maps common commands to short activity labels.
  `terminal-view.ts` owns semantic app-server observability, elapsed-time
  overview lines and the one live detail line. It shows the effective reviewer,
  live context occupancy, compaction, retry state, warnings and safe review
  summaries. Every runner command start is a required progress line.
  `terminal-output.ts` owns the replaceable line and suspends it while
  `human-review.ts` owns an attended prompt. Redirected output writes required
  progress once and omits other detail. Presentation clears the live line on
  close and never changes runner state.
- `main.ts` wires Commander, the shared child-process lifetime controller, the
  runner and the terminal view. When forced-stop confirmation expires, the
  runner writes one diagnostic and one warning, then receives unknown for the
  active run. The runner session stays available. During shutdown it writes the
  same warning and continues exiting. Command-input errors and cursor resets
  never open a transcript.
- Runner admission remains held until all owned children settle. A Git commit
  that already started settles without rollback and starts no later step.
- Keep Git history as the only durable step cursor. Do not add progress files
  or completion marks to plans.
- Never create a branch. Runner-owned commits stay on the current branch.

## Contracts

`src/contracts.ts` owns the stable data exchanged by later steps. Keep its
unions closed and marked by `kind`, `mode`, `status` or `outcome`. The coding
result has no proof field. Plan proofs keep the exact JSON field names from the
plan contract.
