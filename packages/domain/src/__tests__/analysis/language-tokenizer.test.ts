import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { Query } from "web-tree-sitter"
import {
  extensionToLanguage,
  extensionToTokenizerLanguage,
  LANGUAGE_CATALOG,
  TOKENIZER_SUPPORTED_LANGUAGES,
  type Token,
  type TokenizerSupportedLanguage,
  type TokenKind,
  tokenizeSource,
} from "../../analysis/index.js"
import { TOKENIZER_LANGUAGE_MAPPINGS } from "../../analysis/tokenizer-language-mappings.js"
import { loadGrammarForTests } from "../helpers/load-tokenizer-language.js"

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
  "php",
  "py",
  "r",
  "rb",
  "robot",
  "rs",
  "shell",
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

function assertExhaustiveCoverage(source: string, tokens: readonly Token[]) {
  let cursor = 0
  for (const token of tokens) {
    assert.equal(token.start, cursor)
    assert.equal(token.end > token.start, true)
    cursor = token.end
  }
  assert.equal(cursor, source.length)
}

function tokenContaining(
  source: string,
  tokens: readonly Token[],
  needle: string,
): Token {
  const start = source.indexOf(needle)
  assert.notEqual(start, -1, `Missing fixture substring ${needle}`)
  const end = start + needle.length
  const token = tokens.find((candidate) => {
    return candidate.start <= start && candidate.end >= end
  })
  if (token === undefined) {
    assert.fail(`No token contains ${needle}`)
  }
  return token
}

function assertSubstringKind(
  source: string,
  tokens: readonly Token[],
  needle: string,
  kind: TokenKind,
) {
  assert.equal(tokenContaining(source, tokens, needle).kind, kind)
}

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
    assert.equal(extensionToTokenizerLanguage("sql"), undefined)
    assert.equal(extensionToTokenizerLanguage("xhtml"), undefined)
    assert.equal(extensionToLanguage("xhtml"), "html")
  })
})

describe("tokenizeSource", () => {
  it("covers JavaScript source and keeps template substitutions executable", async () => {
    const loaded = await loadGrammarForTests("js")
    const source = [
      'const marker = "// not comment 🚀";',
      "const message = `a $" + "{1 /* real */} b`;",
      "// line",
      "",
    ].join("\n")
    const tokens = tokenizeSource(source, loaded)

    assertExhaustiveCoverage(source, tokens)
    assertSubstringKind(source, tokens, '"// not comment 🚀"', "string-literal")
    assertSubstringKind(source, tokens, "1", "code")
    assertSubstringKind(source, tokens, "/* real */", "comment")
    assertSubstringKind(source, tokens, "// line", "comment")
  })

  it("emits Python documentation only in documentation positions", async () => {
    const loaded = await loadGrammarForTests("py")
    const source = [
      '"""module docs"""',
      'assigned = """not docs"""',
      "def f():",
      '    r"""function docs"""',
      "def g():",
      '    f"""not docs {1}"""',
      "# line",
      "",
    ].join("\n")
    const tokens = tokenizeSource(source, loaded)

    assertExhaustiveCoverage(source, tokens)
    assertSubstringKind(source, tokens, '"""module docs"""', "documentation")
    assertSubstringKind(source, tokens, '"""not docs"""', "string-literal")
    assertSubstringKind(source, tokens, 'r"""function docs"""', "documentation")
    assertSubstringKind(source, tokens, "not docs ", "string-literal")
    assertSubstringKind(source, tokens, "1", "code")
    assertSubstringKind(source, tokens, "# line", "comment")
  })

  it("classifies Ruby heredocs as string literal spans", async () => {
    const loaded = await loadGrammarForTests("rb")
    const source = [
      "value = <<~TEXT",
      "hello # not comment",
      "TEXT",
      "# line",
    ].join("\n")
    const tokens = tokenizeSource(source, loaded)

    assertExhaustiveCoverage(source, tokens)
    assertSubstringKind(source, tokens, "hello # not comment", "string-literal")
    assertSubstringKind(source, tokens, "# line", "comment")
  })

  it("emits Rust doc comments as documentation", async () => {
    const loaded = await loadGrammarForTests("rs")
    const source = [
      "/// docs",
      'let value = "// not comment";',
      "// line",
    ].join("\n")
    const tokens = tokenizeSource(source, loaded)

    assertExhaustiveCoverage(source, tokens)
    assertSubstringKind(source, tokens, "/// docs", "documentation")
    assertSubstringKind(source, tokens, '"// not comment"', "string-literal")
    assertSubstringKind(source, tokens, "// line", "comment")
  })

  it("keeps PHP embedded code and comments out of string literal spans", async () => {
    const loaded = await loadGrammarForTests("php")
    const source = [
      "<?php",
      '$message = "hello {$name /* strip */}";',
      '$literal = "plain /* not a comment */ text";',
    ].join("\n")
    const tokens = tokenizeSource(source, loaded)

    assertExhaustiveCoverage(source, tokens)
    assertSubstringKind(source, tokens, "$name", "code")
    assertSubstringKind(source, tokens, "/* strip */", "comment")
    assertSubstringKind(
      source,
      tokens,
      "plain /* not a comment */ text",
      "string-literal",
    )
  })

  it("classifies XML attribute values as string literals", async () => {
    const loaded = await loadGrammarForTests("xml")
    const source = '<node label="Alice"><!-- strip --></node>'
    const tokens = tokenizeSource(source, loaded)

    assertExhaustiveCoverage(source, tokens)
    assertSubstringKind(source, tokens, '"Alice"', "string-literal")
    assertSubstringKind(source, tokens, "<!-- strip -->", "comment")
  })

  it("treats malformed source as code without throwing", async () => {
    const loaded = await loadGrammarForTests("js")
    const source = 'const value = "unterminated\n// recovery'
    const tokens = tokenizeSource(source, loaded)

    assertExhaustiveCoverage(source, tokens)
  })
})

describe("tokenizer grammar mapping integrity", () => {
  it("matches every supported language to a loadable grammar mapping", async () => {
    assert.deepEqual(
      Object.keys(TOKENIZER_LANGUAGE_MAPPINGS),
      EXPECTED_SUPPORTED_LANGUAGES,
    )

    for (const language of TOKENIZER_SUPPORTED_LANGUAGES) {
      const loaded = await loadGrammarForTests(language)
      const grammar = loaded.parser.language
      if (grammar === null) {
        assert.fail(`Missing loaded grammar for ${language}`)
      }
      const mapping = TOKENIZER_LANGUAGE_MAPPINGS[language]

      const mappedNodeKinds = [
        ...mapping.commentNodeKinds,
        ...mapping.documentationNodeKinds,
        ...mapping.stringNodeKinds,
        ...mapping.embeddedExpressionNodeKinds,
      ]
      for (const nodeKind of mappedNodeKinds) {
        assert.equal(
          grammar?.types.includes(nodeKind),
          true,
          `${language} missing node kind ${nodeKind}`,
        )
      }

      if (mapping.documentationQuerySource !== undefined) {
        const query = new Query(grammar, mapping.documentationQuerySource)
        query.delete()
      }
    }
  })
})
