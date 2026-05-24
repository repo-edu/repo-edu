# CLAUDE.md

This package owns browser-safe tree-sitter grammar WASM assets for source tokenisation.

## Responsibility

- Export a static manifest from `TokenizerSupportedLanguage` ids to committed grammar WASM asset URLs.
- Record acquisition package, upstream source, grammar/runtime ABI, hash, license and notice metadata for every grammar.
- Keep parser lifecycle and host-specific file handling out of this package.

## Rules

- No Node/Electron imports in production `src/` code.
- Do not add a supported tokenizer language without its WASM asset, manifest row, hash, ABI and license metadata.
- Production `@repo-edu/domain` and `@repo-edu/host-runtime-contract` code must not import this package.
