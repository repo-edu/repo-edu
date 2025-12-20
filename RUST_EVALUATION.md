# Rust Codebase Evaluation

Scope: `apps/repo-manage` (core, cli, tauri) and `crates/*` Rust modules. No fmt/clippy/tests were
run for this evaluation (tests were already run by the user).

## Findings (ordered by severity)

- **High**: Template → repo mapping breaks when team/template names contain hyphens; wrong template
  can be pushed or skipped. `apps/repo-manage/repo-manage-core/src/setup.rs:332`
- **High**: GitHub `create_repo` treats any error from `get` as “not found,” masking auth/network
  issues and attempting a create anyway.
  `apps/repo-manage/repo-manage-core/src/platform/github.rs:398`
- **High**: GitLab/Gitea implementations are stubs returning “not implemented,” so claimed support
  will always fail. `apps/repo-manage/repo-manage-core/src/platform/gitlab.rs`,
  `apps/repo-manage/repo-manage-core/src/platform/gitea.rs`
- **Medium**: Existing repos are never tracked; `already_existing` is always empty, so all repos are
  treated as “new,” and pushes run against existing repos.
  `apps/repo-manage/repo-manage-core/src/setup.rs:135`,
  `apps/repo-manage/repo-manage-core/src/setup.rs:330`
- **Medium**: CSV writer does not escape commas/quotes/newlines, producing invalid CSV when names or
  groups contain these chars. `apps/repo-manage/repo-manage-core/src/lms/yaml.rs:149`
- **Medium**: Moodle response preview slices by byte index; can panic on UTF-8 boundaries.
  `crates/moodle-lms/src/client.rs:119`
- **Medium**: Moodle timestamps use `unwrap_or_default`, silently coercing invalid values to epoch
  instead of `None`. `crates/moodle-lms/src/models.rs:49`
- **Medium**: Token storage panics if HOME/USERPROFILE missing.
  `crates/lms-common/src/storage.rs:95`
- **Medium**: Corrupt `tokens.json` is silently discarded (`unwrap_or_default`), causing data loss.
  `crates/lms-common/src/storage.rs:170`
- **Medium**: Tauri commands convert core errors to plain strings, losing structured user messages.
  `apps/repo-manage/src-tauri/src/commands/lms.rs:46`,
  `apps/repo-manage/src-tauri/src/commands/platform.rs:20`
- **Low**: GitHub list endpoints are not paginated; orgs >100 entities will be incomplete.
  `apps/repo-manage/repo-manage-core/src/platform/github.rs:320`,
  `apps/repo-manage/repo-manage-core/src/platform/github.rs:452`
- **Low**: URL validation is just prefix check; malformed URLs pass.
  `apps/repo-manage/repo-manage-core/src/settings/validation.rs:95`
- **Low**: `MemberOption::parse` silently defaults to “Both” on invalid input.
  `apps/repo-manage/repo-manage-core/src/lms/types.rs:37`

## Improvement Plan (prioritized)

1) **Fix template-to-repo mapping and existing-repo detection**
   - Track template name explicitly in `StudentRepo` or keep a mapping; avoid `split('-')`.
   - Return/create an `existing` flag from platform APIs or check existence explicitly.
2) **Harden GitHub API error handling**
   - Only create repo on `PlatformError::NotFound`; otherwise propagate.
   - Add pagination support for teams/repos/issues.
3) **Fix CSV output correctness**
   - Use the `csv` crate and write records instead of manual `writeln!`.
4) **Stabilize Moodle parsing**
   - Replace byte slicing with `chars().take(500)`.
   - Use `and_then(DateTime::from_timestamp)` to avoid epoch defaults.
5) **Improve token storage robustness**
   - Replace `expect` with error propagation.
   - Surface JSON parse errors and preserve/backup corrupted token files.
6) **Preserve structured errors in Tauri commands**
   - Use `?` and `From` conversions to keep user-friendly messages and details.
7) **Decide on GitLab/Gitea support**
   - Implement or remove from supported surface area (CLI/UI messaging).
