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
- Keep production code free of parser lifecycle and host-specific file handling.
- Tests own real-grammar integration with the domain tokenizer and comment
  classifier. Pure language-extension checks stay in the domain package.

## Rules

- No Node/Electron imports in production `src/` code.
- Do not add a supported tokenizer language without its WASM asset, manifest
  row, size, hash, ABI, license expression and committed license text.
- Build and test both run the asset copy. Keep the copy safe when concurrent
  workspace commands target the same output directory.
- The domain package must not depend on this package, including for tests.
- Production `@repo-edu/host-runtime-contract` code must not import this package.
