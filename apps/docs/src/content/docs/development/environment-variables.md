---
title: Environment Variables
description: Every environment variable repo-edu reads, split into the test, fixture and release hooks it defines and the platform, tooling and AI-SDK variables the apps inherit
---

repo-edu reads a fair number of environment variables, but almost none of them are product configuration. The desktop app and the CLI resolve everything they need from canonical defaults, so a normal user never sets one. The variables that matter split into two groups: the ones repo-edu defines for its own tests, fixtures, release tooling and dev scripts, and the ones the apps inherit from the operating system, the package manager, Electron and the AI SDKs. The second group is listed here on purpose, because it shows that environment variables are ubiquitous regardless: the apps already run inside a thick layer of them before we add a single test hook of our own.

Most of repo-edu's own variables exist for one structural reason. The desktop runtime-validation and end-to-end harnesses launch Electron as a separate operating-system process, and a child process can only be configured through its environment. In-process tests need none of these: they inject the same values through constructors, for example the storage root passed to `createProgram` in the CLI or to the desktop store constructors.

## Variables repo-edu defines

### Storage root

| Variable | Read by | Effect | Default |
| --- | --- | --- | --- |
| `REPO_EDU_STORAGE_ROOT` | desktop `main.ts` | Overrides the app-data root for the desktop process. Set by the e2e smoke test and the runtime-validation harness, which each launch Electron against a fresh temporary directory. | the canonical per-platform app-data root |

### Desktop runtime-validation harness

These configure the Electron process that `pnpm --filter @repo-edu/desktop run validate:runtime` spawns.

| Variable | Read by | Effect | Default |
| --- | --- | --- | --- |
| `REPO_EDU_DESKTOP_VALIDATE_TRPC` | desktop `main.ts` | `"1"` runs the in-renderer tRPC validation pass instead of a normal launch. | off |
| `REPO_EDU_DESKTOP_VALIDATE_TRPC_TIMEOUT_MS` | desktop `main.ts`, harness | Timeout for the renderer validation step. | 10000 in the app, 30000 from the harness |
| `REPO_EDU_DESKTOP_VALIDATE_APP_TIMEOUT_MS` | harness | Timeout waiting for the app to become ready. | 60000 |
| `REPO_EDU_DESKTOP_VALIDATE_PACKAGED` | harness | `"1"` forces the packaged Electron binary rather than the dev build. Also implied by `CI=true`. | off |
| `REPO_EDU_VALIDATION_COURSE_ID` | desktop `main.ts` | The course the validation run targets. | the seeded fixture course |
| `REPO_EDU_TEST_USER_FILE_QUEUE` | desktop `main.ts` | Delimiter-joined paths returned in order from the open-file dialog, so a headless run needs no real picker. | empty |
| `REPO_EDU_TEST_SAVE_TARGET_QUEUE` | desktop `main.ts` | The same, for the save-target dialog. | empty |

### Fixture seeding

| Variable | Read by | Effect | Default |
| --- | --- | --- | --- |
| `REPO_EDU_FIXTURE` | desktop `fixture-seed.ts` | A `<tier>/<preset>` or `<tier>/<preset>/<source>` selector; on launch it seeds a course, settings and import artifacts into the storage root. Built by `pnpm dev:fixture` and the validation harness. | no seeding |
| `REPO_EDU_FIXTURE_TIER`, `REPO_EDU_FIXTURE_PRESET`, `REPO_EDU_FIXTURE_SOURCE` | desktop `fixture-seed.ts` | Override a single component of the selector; each takes precedence over the corresponding part of the combined value. | `REPO_EDU_FIXTURE_SOURCE` falls back to `file` |

### Analysis concurrency overrides

Both are applied over the loaded preferences for one launch and stripped from preference saves, so they never persist.

| Variable | Read by | Effect | Default |
| --- | --- | --- | --- |
| `REPO_EDU_REPO_PARALLELISM` | desktop `trpc.ts` | Positive-integer override of the repository parallelism used by analysis. | the persisted preference |
| `REPO_EDU_FILES_PER_REPO` | desktop `trpc.ts` | Positive-integer override of the files scanned per repository. | the persisted preference |

### Cold-start measurement

| Variable | Read by | Effect | Default |
| --- | --- | --- | --- |
| `REPO_EDU_DESKTOP_MEASURE` | desktop `main.ts` | `"1"` enables cold-start instrumentation. Set by `scripts/measure-cold-start.mjs`. | off |

### Integration tests

The live-provider suite in `@repo-edu/integration-tests` reads its endpoints and credentials from the environment. Unconfigured providers are skipped.

| Variable | Read by | Effect | Default |
| --- | --- | --- | --- |
| `INTEGRATION_GIT_PROVIDERS` | provider matrix | Comma-separated list of providers to run. | `gitea` |
| `INTEGRATION_GITEA_URL`, `GITEA_PORT` | Gitea harness | Gitea base URL; the admin token is minted at runtime. `GITEA_PORT` composes the default URL. | `http://localhost:3000` |
| `INTEGRATION_GITHUB_URL`, `INTEGRATION_GITHUB_TOKEN`, `INTEGRATION_GITHUB_ORG`, `INTEGRATION_GITHUB_USERNAMES` | GitHub harness | API base, token, target organisation and the username pool used by tests. | base `https://github.com` |
| `INTEGRATION_GITLAB_URL`, `INTEGRATION_GITLAB_TOKEN`, `INTEGRATION_GITLAB_PARENT_GROUP` | GitLab harness | API base, token and the parent group that new groups are created under. | parent group `integration-root` |

### Release license gate

| Variable | Read by | Effect | Default |
| --- | --- | --- | --- |
| `REPO_EDU_RELEASE_FORBID_ELECTRON_RUNTIME_INSTALL` | `tools/release` | `"1"` makes the license gate fail rather than run Electron's runtime install when a packaged `dist/LICENSES.chromium.html` is missing. | off |

### Workspace and fixture-recording scripts

| Variable | Read by | Effect | Default |
| --- | --- | --- | --- |
| `REDU_WORKSPACE_ROOT` | `pnpm fixture` | Explicit workspace root. | auto-detected by walking up to `pnpm-workspace.yaml` |
| `DOCS_ANALYSIS_FIXTURE_ROOT` | `pnpm docs:record-fixtures` recorder | Output root for recorded analysis fixtures. | `/repo-edu-demo/shared-analysis-fixture` |

## Variables repo-edu inherits

These are not ours; the code reads conventions that the platform, the toolchain and the SDKs already define. They are listed only to show the baseline our own variables sit on top of.

**Platform and paths.** `HOME`, `USERPROFILE`, `LOCALAPPDATA`, `APPDATA` and `XDG_CONFIG_HOME` feed the app-data root resolver and the Claude CLI executable search; `PATH` is used for that same search and for spawning `git`.

**Package manager, Electron and build tooling.** `INIT_CWD` (pnpm's invocation directory, used by `pnpm fixture` and `pnpm file-sizes`), `npm_execpath`, `npm_config_platform` and `npm_config_arch` (npm and electron-builder packaging), `ELECTRON_INSTALL_PLATFORM` and `ELECTRON_INSTALL_ARCH` (Electron's installer), `CSC_IDENTITY_AUTO_DISCOVERY` (electron-builder code-signing), `ELECTRON_RENDERER_URL` (the electron-vite dev server) and `CI`.

**AI SDK authentication.** `ANTHROPIC_API_KEY` and `CODEX_API_KEY` are read by the Claude and Codex SDKs respectively. The adapters pass `process.env` straight through and select API-key auth when the key is present, falling back to the SDK's subscription or CLI auth when it is not. repo-edu defines neither variable; they are the SDKs' own.
