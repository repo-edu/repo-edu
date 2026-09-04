# CLAUDE.md

This package owns browser-safe tree-sitter grammar WASM assets for source tokenisation.

## Responsibility

- Export a static manifest from `TokenizerSupportedLanguage` ids to committed grammar WASM asset
  URLs.
- Record acquisition package, upstream source, grammar/runtime ABI, hash,
  license expression, committed license text and notice metadata for every
  grammar.
- `scripts/validate-manifest.ts` proves asset size/hash metadata and non-empty
  license and notice text files.
- `scripts/copy-assets.ts` synchronizes `src/assets` into build output through
  atomic per-file replacement and removes stale output entries.
- Keep parser lifecycle and host-specific file handling out of this package.

## Rules

- No Node/Electron imports in production `src/` code.
- Do not add a supported tokenizer language without its WASM asset, manifest
  row, size, hash, ABI, license expression and committed license text.
- Build and test both run the asset copy. Keep the copy safe when concurrent
  workspace commands target the same output directory.
- Production `@repo-edu/domain` and `@repo-edu/host-runtime-contract` code must not import this
  package.
