---
title: Repository Records
description: Design of Assignment.repositories, the split between plan inputs and operation artifacts, and how RepoBee validates the direction
---

Repository records are the operation artifacts that Create, Clone, and Update produce and consume. They live on the `Assignment` type as `repositories: Record<groupId, repoName>` and are persisted inside `courses/<id>.json`. This page captures the reasoning behind the design and the options that were rejected.

## The split: plan inputs vs operation artifacts

Two categories of state are involved in repository operations:

1. **Plan inputs** — the roster, the groups, the naming template. These are editable over the life of a course: students are added or dropped, group names are edited, templates are tuned.
2. **Operation artifacts** — the names and identifiers of the repositories that actually exist on the Git provider. These are *established* by a successful Create (or by an external tool), and from the app's perspective they are immutable thereafter.

Before records existed, the planner took the current plan inputs and computed the expected repository name fresh on every run. That works for Create, but it leaks into Update and Clone — operations that should act on *existing* server repositories — and causes three symptoms:

- **Name drift.** Templates like `{assignment}-{members}` produce a different name after any roster edit. A group that had `alice,bob` at Create time has `rpg-alice-bob` on the server. Remove `bob`, and re-derivation yields `rpg-alice`, which doesn't exist.
- **Empty-group proactive skipping.** A group whose members all went inactive produces an empty `{members}` token, so the planner pre-skipped it to avoid a malformed name. The filter was load-bearing for Create but leaked into Update/Clone.
- **No way to reference externally-created repos.** If repositories were made by another tool (or by hand), there was no state to reference them — the app could only re-derive names and hope they matched.

The fix collapses all three into one: store the operation artifact. Once the Git provider accepts a repository name, repo-edu writes it onto the assignment and uses it verbatim on future runs.

## Comparison with RepoBee

RepoBee is the closest-adjacent teacher-facing Git tool, and its behavior was used as a reference point when the design was finalized. The comparison validated the direction repo-edu took rather than supplying a pattern to copy.

- **RepoBee does not filter by active/inactive status.** No such concept exists in RepoBee. It iterates every team the teacher passes on the CLI. (`src/_repobee/cli/parsing.py` in the RepoBee source.) repo-edu's decision to drop the `activeMemberIds` filter from Update/Clone lines up with this.
- **RepoBee re-derives names from the current team name on every operation.** It does not persist repository names anywhere, so renaming a team after the fact breaks its bookkeeping. Recording the accepted name after Create (and on adoption during Clone/Update) is a deliberate improvement over this baseline, not a catch-up.
- **RepoBee silently filters failed clones out of the result.** repo-edu surfaces server-missing repositories as failures in `repositoriesFailed`. Explicit-miss reporting was chosen over silent drop because the silent-drop mode makes partial failures invisible.
- **RepoBee has a `--discover-repos` mode** that lists the org's actual repositories and matches them back to teams by name. repo-edu adopts a reduced form as [`redu repo discover`](/repo-edu/cli/repo-commands/#redu-repo-discover) (namespace-scoped bulk clone, no match-to-team). Matching repos to groups on a server-to-course basis was deliberately left out — when the names align, the assignment-scoped Clone adopts them anyway as a side effect; when they don't, automatic matching would guess incorrectly.

## What records store

The `repositories` map stores one thing: the repository name keyed by `groupId`. Nothing else — no provider-native identifier, no URL, no timestamp, no organization snapshot.

This was not an oversight. A richer record shape was considered and rejected because each extra field carries its own risk:

- **`providerRepoId` (GitLab project id, GitHub node id, etc.)** would survive a server-side rename. But no current workflow renames server repositories, and the realistic rename path ("teacher fixes a typo in a group name and renames the server repo to match") still requires a manual record update either way. Not adding it keeps the record trivial; adding it later is a schema extension.
- **`provider` / `baseUrl` snapshots** would protect against the teacher switching their active Git connection after Create. That isn't a realistic mid-semester workflow; if it ever happens, the fallback (Clone reports `not_found`, teacher re-points the profile) is acceptable.
- **`organization` snapshot** would protect against the teacher editing `course.organization`. That edit almost always means "I had a typo", in which case the snapshot holds the *wrong* value and treating it as authoritative actively misleads.
- **`createdAt`** is pure observability. No workflow depends on it.

A separate `repo.reconcile` workflow was also considered and rejected. Clone's natural behavior — derive a name if none is recorded, attempt the operation, record the accepted name on success — covers the adoption path. A second workflow would duplicate surface area for no extra behavior.

## Options considered

### Option A — relax the `activeMemberIds` filter for Update/Clone only

Keep re-deriving names everywhere; drop the filter from Update and Clone so those operations attempt every group. Minimal change, no schema extension.

Rejected because it does not address the drift bug. `{members}`-parameterized templates still break after any roster edit. "Works today, breaks tomorrow" is a workaround.

### Option B — persist rich repository records

Add an `AssignmentRepository` record type with `groupId`, `repoName`, `providerRepoId`, `provider`, `baseUrl`, `organization`, `createdAt`. Add a separate `repo.reconcile` workflow for adopting externally-created repositories.

Rejected because every extra field was included defensively, not because a current workflow needed it. The cost is surface area and test matrix; the benefit is coverage for scenarios the app does not currently exercise. Any of these fields can be added later when a concrete need surfaces.

### Option C — persist only the name (chosen)

Add `Assignment.repositories: Record<groupId, repoName>`. No separate workflow; Clone and Update handle adoption as a byproduct of their normal flow.

Solves the root cause (names no longer re-derive after Create), stays minimal, leaves room to grow. No rename resilience, no connection-change resilience, no audit trail — all acceptable because no current workflow needs them.

## Consequences

- **Update and Clone are roster-independent.** Once a name is recorded, the operation runs against that name regardless of whether the group's members have since changed. `{members}`-parameterized templates stop drifting.
- **Adoption is a side effect of Clone and Create.** A teacher whose repositories were created by another tool sets the naming template to match the server-side names and runs Clone. Derived names that match are cloned and recorded; mismatches are reported as failures. No migration workflow, no special UI.
- **Create is idempotent by construction.** On re-run, each recorded name is sent back to the provider, which returns `alreadyExisted` for the common case (`repositoriesAdopted`) or `created` for the self-healing case where the server repo was deleted out-of-band (`repositoriesCreated`). The record is refreshed from whichever response came back.
- **Stale records are pruned at write time.** When records are merged back onto the course, entries whose `groupId` is no longer in the assignment's group set are dropped. This is per-run, not continuous: a deleted group's orphan record lingers until the next successful Create/Clone/Update, but has no behavioral effect in the meantime.
- **No rename propagation.** If a server repository is renamed out-of-band, the record goes stale and Clone/Update will fail. Restoring correctness requires editing `repositories[groupId]` in the course JSON or re-running Clone after fixing the naming template. Acceptable because no in-app workflow renames server repos.

## Result-shape semantics

All three repository workflows carry a `recordedRepositories: Record<assignmentId, Record<groupId, repoName>>` on their result. Both the CLI and the renderer apply this back onto the course on success (the renderer via `updateAssignment`, the CLI via a helper alongside `applyTemplateCommitShas`), so the two surfaces stay at parity.

Create's result splits its counters explicitly: `repositoriesCreated` (fresh), `repositoriesAdopted` (provider reported `alreadyExisted`), `repositoriesFailed` (outright rejections). This split exists because only fresh-created repositories receive template content — the adopted counter gates template-push semantics. Clone has no such gate and folds adoption silently into `repositoriesCloned`; Update reports PR outcomes (`prsCreated` / `prsSkipped` / `prsFailed`) instead.

## See also

- [Data Model](/repo-edu/development/data-model/) — the full `PersistedCourse` shape
- [Repository Setup](/repo-edu/user-guide/repository-setup/) — user-facing workflow
- [Coming from RepoBee](/repo-edu/user-guide/from-repobee/) — migration path
