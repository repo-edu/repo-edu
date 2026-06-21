import type { Parser } from "web-tree-sitter"

export const TOKENIZER_SUPPORTED_LANGUAGES = [
  "c",
  "cpp",
  "cs",
  "go",
  "haskell",
  "java",
  "js",
  "jsx",
  "kotlin",
  "matlab",
  "php",
  "py",
  "r",
  "rb",
  "robot",
  "rs",
  "shell",
  "sql",
  "toml",
  "ts",
  "tsx",
  "xml",
] as const

export type TokenizerSupportedLanguage =
  (typeof TOKENIZER_SUPPORTED_LANGUAGES)[number]

/**
 * Loader-owned parser handle. `tokenizeSource` mutates the parser
 * synchronously with `reset()` and `parse()`, so callers must finish each
 * tokenization call before reusing the same handle in another flow.
 */
export type LoadedTokenizerLanguage = {
  readonly language: TokenizerSupportedLanguage
  readonly parser: Parser
}
