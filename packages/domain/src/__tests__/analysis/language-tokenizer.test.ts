import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  extensionToLanguage,
  extensionToTokenizerLanguage,
  LANGUAGE_CATALOG,
  TOKENIZER_SUPPORTED_LANGUAGES,
  type TokenizerSupportedLanguage,
} from "../../analysis/index.js"

const EXPECTED_SUPPORTED_LANGUAGES = [
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

const EXCLUDED_TOKENIZER_EXTENSIONS = new Set([
  "htm",
  "html",
  "lhs",
  "rlib",
  "xhtml",
  "jspx",
])

describe("extensionToTokenizerLanguage", () => {
  it("matches the initial tokenizer rollout set", () => {
    assert.deepEqual(
      TOKENIZER_SUPPORTED_LANGUAGES,
      EXPECTED_SUPPORTED_LANGUAGES,
    )
  })

  it("maps catalogue extensions through the tokenizer support boundary", () => {
    for (const [language, entry] of Object.entries(LANGUAGE_CATALOG)) {
      for (const extension of entry.extensions) {
        const result = extensionToTokenizerLanguage(extension)
        const dotted = extensionToTokenizerLanguage(
          `.${extension.toUpperCase()}`,
        )

        if (EXCLUDED_TOKENIZER_EXTENSIONS.has(extension)) {
          assert.equal(result, undefined)
          assert.equal(dotted, undefined)
          continue
        }

        if (
          TOKENIZER_SUPPORTED_LANGUAGES.includes(
            language as TokenizerSupportedLanguage,
          )
        ) {
          assert.equal(result, language)
          assert.equal(dotted, language)
        } else {
          assert.equal(result, undefined)
          assert.equal(dotted, undefined)
        }
      }
    }
  })

  it("keeps catalogue extension aliases mapped to parent language ids", () => {
    assert.equal(extensionToTokenizerLanguage("mjs"), "js")
    assert.equal(extensionToTokenizerLanguage("cts"), "ts")
    assert.equal(extensionToTokenizerLanguage("m"), "matlab")
    assert.equal(extensionToTokenizerLanguage("sql"), "sql")
    assert.equal(extensionToTokenizerLanguage("xhtml"), undefined)
    assert.equal(extensionToLanguage("xhtml"), "html")
  })
})
