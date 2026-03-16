# Plan: Repobee Parity for `repo.create` and new `repo.update`

## Context

Bring repo-edu's repository management to feature parity with repobee's `repos setup` and `repos update` commands, incorporating findings P1–P2 and the confirmed preference for squashed template history (GitHub template API).

---

## Phase 1: Fix `repo.create` to match repobee `repos setup`

### 1A. Idempotent error reporting (P1 finding 1)

**Problem:** `repo.create` returns success even when zero repos are created — errors are swallowed in provider clients, and the result reports `repositoriesPlanned` not `repositoriesCreated`.

**Changes:**

- **`integrations-git-contract`** — Replace opaque `createdCount`/`repositoryUrls` with three-bucket result:

  ```text
  CreateRepositoriesResult = {
    created: { name: string, url: string }[]
    alreadyExisted: { name: string, url: string }[]
    failed: { name: string, reason: string }[]
  }
  ```

  `alreadyExisted` captures HTTP 422/409 "name already exists" responses — these are not failures and must not block idempotent reruns (matching repobee's `_create_or_fetch_repo` which falls back to `get_repo` on `PlatformError`).

- **`integrations-git` (all 3 providers)** — Catch per-repo errors and classify:
  - HTTP 422/409 with "already exists" → fetch the existing repo URL, add to `alreadyExisted`.
  - All other errors → add to `failed` with reason string.

- **`application-contract`** — Split result types for create vs clone (they currently share `RepositoryBatchResult`):
  - `RepositoryCreateResult = { repositoriesPlanned, repositoriesCreated, repositoriesAlreadyExisted, repositoriesFailed, completedAt }`
  - `RepositoryCloneResult = { repositoriesPlanned, repositoriesCloned, repositoriesFailed, completedAt }`
  - Update `WorkflowPayloads["repo.create"]` and `WorkflowPayloads["repo.clone"]` accordingly.

- **`application` (`repo.create` handler)** — After provider call:
  - Emit diagnostic output per `alreadyExisted` entry (info channel).
  - Emit diagnostic output per `failed` entry (error channel).
  - Throw `AppError` only if `created.length === 0 && alreadyExisted.length === 0` and repos were planned (all truly failed). Reruns with existing repos succeed.

### 1B. Team/member permission setup (P1 finding 2)

**Problem:** repobee creates teams, assigns members with push permission, and assigns repos to teams. repo-edu only creates repos.

**Changes:**

- **`integrations-git-contract`** — Add new methods to `GitProviderClient`:

  ```text
  createTeam(draft, request: CreateTeamRequest): Promise<CreateTeamResult>
  assignRepositoriesToTeam(draft, request: AssignReposToTeamRequest): Promise<void>
  ```

  Types:
  - `CreateTeamRequest = { organization, teamName, memberUsernames, permission }`
  - `CreateTeamResult = { created: boolean, teamSlug: string, membersAdded: string[], membersNotFound: string[] }`

- **`integrations-git` (all 3 providers)** — Implement with username→ID resolution where needed:
  - GitHub: `octokit.teams.create()` / `octokit.teams.getByName()`, `octokit.teams.addOrUpdateMembershipForUser()`, `octokit.teams.addOrUpdateRepoPermissions()`. GitHub accepts usernames directly.
  - GitLab: Resolve `username → userId` via `api.Users.all({ username })` first, then `api.GroupMembers.add(groupId, userId, accessLevel)` for member assignment, `api.Projects.share(projectId, groupId, accessLevel)` for repo→team. GitLab requires user IDs, not usernames.
  - Gitea: `POST /orgs/{org}/teams`, `PUT /teams/{id}/members/{user}`, `PUT /teams/{id}/repos/{org}/{repo}`. Gitea accepts usernames directly.

- **`domain`** — Add `resolveGitUsernames(roster, memberIds): { resolved: { memberId, gitUsername }[], missing: string[] }` helper. Members with `gitUsername === null` go to `missing`; the workflow emits a diagnostic warning per missing username but does not fail the whole operation (matching repobee's behavior of silently skipping missing users).

- **`application` (`repo.create` handler)** — After repo creation step, add two new steps:
  - Step 4: Create teams (one per planned group) and assign members with push permission. Skip members without `gitUsername` with diagnostic output.
  - Step 5: Assign each created/already-existing repo to its corresponding team.
  - Update `totalSteps` from 4 → 6.

### 1C. Fix internal visibility (P1 finding 3)

**Problem:** `private: request.template.visibility === "private"` treats "internal" as public.

**Change:**

- **`integrations-git` (GitHub)** — Change to `private: request.template.visibility !== "public"`. This matches repobee's unconditional private repos and correctly handles "internal".
- **`integrations-git` (GitLab)** — Map visibility directly: `"private" | "internal" | "public"` → GitLab's native `visibility` field on `Projects.create()`.
- **`integrations-git` (Gitea)** — Same as GitHub: `private: visibility !== "public"`.

### 1D. Per-assignment template repos (P2 finding 4)

**Problem:** Only one course-level `RepositoryTemplate` is supported. repobee maps each assignment to its own template repo.

**Changes:**

- **`domain`** — Add `repositoryTemplate: RepositoryTemplate | null` to the `Assignment` type. When set, it overrides the course-level template for that assignment's repos. When null, falls back to the course-level template (current behavior).

- **`application-contract`** — Keep `template` on `RepositoryBatchInput` as the course-level fallback. Document explicit precedence: **assignment-level template wins over course-level template**.

- **`application` (`repo.create`)** — Group planned repos by effective template before issuing provider calls:
  1. Resolve effective template per assignment: `assignment.repositoryTemplate ?? input.template ?? null`.
  2. Group repos by `(effectiveTemplate, repoName)` — deduplicate so the same `repoName` is never sent twice even if two assignments accidentally resolve to the same name.
  3. Issue one `createRepositories` call per distinct template (different templates require different API calls).
  4. If no template is resolved, set `autoInit: true` to avoid creating empty repos.

- **`integrations-git-contract`** — Add `autoInit: boolean` to `CreateRepositoriesRequest` so the provider creates a non-empty repo when no template is available.

- **`integrations-git` (all 3 providers)** — Pass `auto_init: true` when the flag is set and no template is provided.

### 1E. Use GroupSet.repoNameTemplate in planning (P2 finding 5)

**Problem:** The UI allows editing `repoNameTemplate` on GroupSet but `collectRepositoryGroups` always uses the domain default.

**Changes:**

- **`application` (`collectRepositoryGroups`)** — Look up the GroupSet for the assignment being planned. If `groupSet.repoNameTemplate` is non-null, pass it as the `template` argument to `planRepositoryOperation()` instead of using the default.

- **`apps/cli` (`repo.ts` dry-run path)** — The CLI dry-run also calls `planRepositoryOperation` directly without the GroupSet template. Update it to resolve the GroupSet and pass the custom template, keeping dry-run output consistent with actual execution.

---

## Phase 2: New `repo.update` workflow

Matches repobee's `repos update` — push template changes to existing student repos via PRs.

### 2A. Domain: track template source commit

- **`domain`** — Add `templateCommitSha: string | null` to `Assignment`. Populated when `repo.create` runs, storing the template repo's HEAD SHA at creation time.

### 2B. Git provider contract additions

- **`integrations-git-contract`** — Add methods:

  ```text
  getRepositoryDefaultBranchHead(draft, request): Promise<{ sha: string } | null>
  createBranch(draft, request: CreateBranchRequest): Promise<void>
  createPullRequest(draft, request: CreatePullRequestRequest): Promise<{ url: string }>
  getTemplateDiff(draft, request: GetTemplateDiffRequest): Promise<{ files: PatchFile[] } | null>
  ```

### 2C. Application: `repo.update` workflow

- **`application-contract`** — Register `"repo.update"` workflow with its own types. Input: `{ course, appSettings, assignmentId }`. Result: `{ prsCreated: number, prsSkipped: number, prsFailed: number }`.

- **`application`** — Implement handler:
  1. Read snapshots, resolve git draft.
  2. Plan repos (same as `repo.create` planning).
  3. Get current template HEAD SHA via `getRepositoryDefaultBranchHead`.
  4. If HEAD SHA equals stored `templateCommitSha`, skip (no changes). Emit "Template unchanged" diagnostic.
  5. Get diff between stored SHA and current HEAD via `getTemplateDiff`.
  6. For each student repo: create branch `template-update-{sha[0:7]}`, apply patch, open PR with title "Template update" and body listing changed files.
  7. Update `assignment.templateCommitSha` to current HEAD.
  8. Return counts.

### 2D. Provider implementations

- **`integrations-git` (all 3 providers)** — Implement the new contract methods using:
  - GitHub: `octokit.repos.compareCommits()`, `octokit.git.createRef()`, `octokit.repos.createOrUpdateFileContents()`, `octokit.pulls.create()`
  - GitLab: `api.Repositories.compare()`, `api.Branches.create()`, `api.Commits.create()`, `api.MergeRequests.create()`
  - Gitea: `/repos/{owner}/{repo}/compare/`, `/repos/{owner}/{repo}/branches`, `/repos/{owner}/{repo}/contents/`, `/repos/{owner}/{repo}/pulls`

### 2E. CLI and Desktop wiring

- **`apps/cli`** — Add `redu repo update --assignment <name>` command.
- **`apps/desktop`** — Wire `repo.update` in tRPC router and workflow registry.
- **`packages/app`** — Add UI trigger (button in assignment/repo panel).

---

## Phase 3: CLI parity options

### 3A. Multi-assignment support

- **`apps/cli`** — Allow `--assignment` to accept comma-separated names or `--all` flag. Already supported in the application layer (`assignmentId: null` = all assignments).

### 3B. Student/group filtering

- **`apps/cli`** — Add `--groups <name,...>` option to filter by group name. Resolve group names to IDs and pass as `groupIds` in `RepositoryBatchInput` (already supported by the application layer).

---

## Implementation order

1. **1C** (visibility fix) — smallest, isolated change
2. **1E** (repoNameTemplate threading) — small, isolated, includes CLI dry-run fix
3. **1A** (error reporting) — contract + all providers + application + result type split
4. **1D** (per-assignment templates) — domain + contract + application + dedup logic
5. **1B** (team/member setup) — new provider methods + username resolution + application steps
6. **2A–2E** (repo.update) — new workflow end-to-end
7. **3A–3B** (CLI options) — additive CLI changes
