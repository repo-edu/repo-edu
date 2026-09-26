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

- Package notices use good-faith evidence from the installed dependency graph.
  Keep package discovery and license-file selection in
  `license-checker-rseidelsohn`. Use its dedicated license text when available.
  When it finds no dedicated file or selects a README, record the installed
  package's declared license as metadata evidence. Never label README content
  as license text or invent a declaration from it.
- Apply the same license policy to text-backed and metadata-only records.
  Missing declarations on the metadata path, unknown or guessed expressions,
  invalid expressions and disallowed licenses still fail the release. A
  selected dedicated license file with unusable text remains an evidence error.
- Package names and versions identify evidence; they do not require approval
  lists or checker clarifications to use declared metadata. Test these rules
  with controlled fixtures. Real dependency-graph tests check coverage and
  usable evidence without fixing one package's current evidence format.
- Release checks are artifact-specific. Do not infer a packaged runtime from
  source imports or from a host Node test.
- Keep app, platform and artifact-target combinations exhaustive and exact.
  Unsupported or duplicate targets fail closed.
- A compiled CLI preflight must run the program-gate artifact proof before its
  license gate. Packaged desktop workflows must run program-gate and Windows
  child-process lifetime proofs through the desktop runtime validation chain.
  The program-gate validator also smoke-runs storage on each artifact: one
  course transaction in both runtimes and atomic settings replacement in Electron.
- Runtime package records must identify the package that supplied the shipped
  binary. Do not pin or invent a transitive package outside the reached
  production closure.
- Version-coupled attestations apply to committed evidence for libraries
  embedded in a runtime, whose notices the installed package does not expose.
  They do not apply to package declarations read from the installed tree.
- Keep signing resources in the session manifest as they are created. Cleanup
  reads that manifest and unwinds resources in reverse order.
- Tests must pin release-workflow wiring, runtime closure decisions, notice
  content and failure behaviour.
