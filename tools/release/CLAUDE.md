# CLAUDE.md

This is the release tool (`@repo-edu/release`). It owns version release
preflight, macOS signing setup and cleanup, and third-party runtime notices for
the shipped desktop and CLI artifacts.

## Entry points

- `src/main.ts`: checks a clean tree and unused tag, runs repository and release
  preflight, updates desktop and CLI versions, commits, tags and pushes.
- `src/license-gate-cli.ts` + `src/license-gate.ts`: validate an exact
  app/platform/artifact-target tuple and write its notice manifest.
- `src/macos-signing-prepare-cli.ts` and
  `src/macos-signing-cleanup-cli.ts`: manifest-backed signing resource setup and
  reverse-order cleanup.
- `src/release-workflows.test.ts`: keeps local release preflight and GitHub
  workflow wiring aligned.

## License and runtime ownership

- `license-gate/closure.ts` derives the production dependency closure from
  `pnpm list`.
- `license-gate/scanner.ts` scans package notices. Scanner parity must match the
  reached third-party closure after explicit runtime records are included.
- `license-gate/policy.ts` is the only license-expression admission owner.
- `license-gate/runtime-assets.ts` composes desktop, CLI, tokenizer, Codex and
  ripgrep runtime records.
- `license-gate/runtime-desktop.ts` owns Electron, electron-builder and Koffi
  platform-runtime notices.
- `license-gate/runtime-cli.ts` owns Bun, the selected `@oven/bun-*` runtime and
  the exact-version attestation for Bun-linked libraries.
- `license-gate/runtime-notices/` contains committed notice text for runtime
  assets that packages do not expose directly.

## Rules

- Release checks are artifact-specific. Do not infer a packaged runtime from
  source imports or from a host Node test.
- Keep app, platform and artifact-target combinations exhaustive and exact.
  Unsupported or duplicate targets fail closed.
- A compiled CLI preflight must run the program-gate artifact proof before its
  license gate. Packaged desktop workflows must run program-gate and Windows
  child-process lifetime proofs through the desktop runtime validation chain.
- Runtime package records must identify the package that supplied the shipped
  binary. Do not pin or invent a transitive package outside the reached
  production closure.
- Version-coupled attestations fail closed after a runtime upgrade until the
  linked subjects and notice evidence are checked again.
- Keep signing resources in the session manifest as they are created. Cleanup
  reads that manifest and unwinds resources in reverse order.
- Tests must pin release-workflow wiring, runtime closure decisions, notice
  content and failure behavior.
