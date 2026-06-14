---
title: Continuous Integration
description: How CI validation is structured, the cross-platform matrix, and the Electron-on-CI failure that took many commits to resolve
---

CI validates every supported platform from one reusable workflow. Most of the
effort behind it went into a single problem: getting Electron to install and
launch reliably on cold CI runners under pnpm 11. This page documents how the
workflows are laid out and records what was needed to make them green, so the
dead ends do not get re-chased.

## Workflow layout

All CI logic lives in `.github/workflows/`. The validation steps are defined
once and reused across platforms:

- `ci-platform.yml` — the reusable workflow (`workflow_call`) that owns every
  validation step: setup, runner assertions, format/lint/typecheck, build,
  test, and runtime validation. This is the single source of truth for what CI
  does.
- `ci-<platform>.yml` — thin dispatchable wrappers (one per platform) that pass
  a runner label and per-platform policy into `ci-platform.yml`. Each is also
  runnable on its own via `workflow_dispatch` for isolating a single platform.
- `ci.yml` — the aggregate workflow that fans out across all five platform
  wrappers. It triggers on pushes to `renovate/**`, on `workflow_dispatch`, and
  via `workflow_call`.

A shared composite action, `.github/actions/setup`, installs pnpm and Node and
runs `pnpm install --frozen-lockfile`. It is the only place that performs the
install, so dependency setup never drifts between platforms.

## Platform matrix

`ci.yml` validates five platform/architecture combinations. Each wrapper sets a
runner and two policy inputs: `runtime_validation` (how the desktop runtime
check runs) and `format_check` (whether markdown formatting is verified on that
runner).

| Platform | Runner | Runtime validation | Format check |
|----------|--------|--------------------|--------------|
| linux-x64 | `ubuntu-latest` | `linux-xvfb` | yes |
| linux-arm64 | `ubuntu-24.04-arm` | `linux-xvfb` | yes |
| macos-arm64 | `macos-15` | `plain` | yes |
| windows-x64 | `windows-latest` | `plain` | yes |
| windows-arm64 | `windows-11-arm` | `plain` | no |

`format_check` is disabled on windows-arm64 because `rumdl` has no prebuilt
binary for that target; markdown formatting is already verified on the other
four runners, so skipping it there loses no coverage.

`ci-platform.yml` asserts the running architecture before doing any work (for
example `uname -m` must be `aarch64` on linux-arm64) and rejects any unsupported
`platform` or `runtime_validation` value up front, so a typo fails loudly
instead of silently skipping a conditional step.

## Shared setup invariants

A few small fixes removed recurring noise and drift from every run:

- **pnpm version ownership.** The verified pnpm version lives in the root
  `package.json` `packageManager` field (`pnpm@11.5.3`). `pnpm/action-setup`
  reads it from there, so CI and local installs use the same pnpm and the
  version is owned in exactly one place.
- **Node 24 for actions.** `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"` is set
  workspace-wide to run JavaScript actions on Node 24 and suppress the Node 20
  deprecation warnings the runners emit.
- **Build-script gating.** Native packages that need a postinstall build step
  (Electron, esbuild, sharp, tree-sitter-cli, bun, electron-winstaller) are
  listed under `allowBuilds` in `pnpm-workspace.yaml`. This is pnpm's canonical
  mechanism for letting trusted packages run their install scripts.

## The Electron-on-CI problem

The hard part was the desktop runtime validation step, which builds the Electron
app and then launches it to exercise the tRPC wiring against a fixture. It
failed for a long run of commits, and most of the obvious fixes either did
nothing or moved the symptom around.

### Symptom

Under pnpm 11 on a **cold** CI store, the npm `electron` package's postinstall
reports success (exit 0, prints "Done") but leaves its `dist/` directory grossly
incomplete: only `locales/`, with no binary, no `path.txt` and no
`LICENSES.chromium.html`. pnpm swallows the postinstall output, so the install
looks clean. Anything that then resolves Electron from the npm package fails:
`require("electron")` throws "Electron failed to install correctly", and the
release license gate cannot find the Chromium notices.

Local development never hit this, because a warm pnpm store already holds a
complete Electron.

### Diagnosis and fix

The failure first surfaced on the macOS runner, which made it look
macOS-specific. Mirroring the exact same runtime validation onto a Linux arm64
runner, with the architecture held constant so the operating system was the only
changed variable, reproduced it identically. That ruled the OS out and proved a
platform-general pnpm 11 cold-store install bug, so the fix could target the real
cause. CI still fans out across all five platforms, including macOS.

The reliable Electron on a CI runner is the one `electron-builder` downloads when
it packages the app, not the half-installed npm package. `pnpm build` runs before
runtime validation, so a complete packaged app already exists under
`apps/desktop/release/` by the time the check runs. Runtime validation resolves
Electron defensively in `apps/desktop/scripts/validate-trpc-spike.mjs`: it tries
`require("electron")` first, and when that npm package is unusable it falls back
to the packaged executable for the host platform
(`RepoEdu.app/Contents/MacOS/RepoEdu` on macOS, `release/linux-*-unpacked/repo-edu`
on Linux, `release/win-*-unpacked/RepoEdu.exe` on Windows). The release license
gate applies the same fallback to source the Chromium notices from the packaged
app.

Already investigated and ruled out as neither cause nor fix: code signing and
notarization, the runner OS version, and disabling the pnpm side-effects cache.

## Runtime validation modes

The `runtime_validation` input controls how the desktop launch check runs:

- `plain` — launch the validator directly (macOS and Windows runners).
- `linux-xvfb` — install `xvfb` and run under `xvfb-run`, since Linux runners
  have no display server. Electron is also launched with `--no-sandbox` on Linux
  CI.
- `none` — skip the runtime check entirely.

## Relationship to Renovate

`ci.yml` triggers on pushes to `renovate/**`, which is what makes the dependency
automation safe. Renovate opens an update on a `renovate/**` branch, CI runs the
full matrix against it, and a green run fast-forwards onto `main` without a
human in the loop. A PR surfaces only when CI fails. So a bad upstream release
becomes a red branch, never a broken `main`.
