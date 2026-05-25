import type { TokenizerSupportedLanguage } from "./language-tokenizer.js"

export type TokenizerLanguageMapping = {
  readonly assetLanguage: TokenizerSupportedLanguage
  readonly commentNodeKinds: readonly string[]
  readonly documentationNodeKinds: readonly string[]
  readonly stringNodeKinds: readonly string[]
  readonly embeddedExpressionNodeKinds: readonly string[]
  readonly documentationQuerySource?: string
}

const JS_FAMILY_MAPPING = {
  commentNodeKinds: ["comment", "html_comment"],
  documentationNodeKinds: [],
  stringNodeKinds: ["string", "template_string", "regex"],
  embeddedExpressionNodeKinds: ["template_substitution"],
} as const

const C_FAMILY_MAPPING = {
  commentNodeKinds: ["comment"],
  documentationNodeKinds: [],
  stringNodeKinds: [
    "char_literal",
    "concatenated_string",
    "string_literal",
    "system_lib_string",
  ],
  embeddedExpressionNodeKinds: [],
} as const

const PYTHON_DOCUMENTATION_QUERY = `
(module . (expression_statement (string) @documentation))
(class_definition
  body: (block . (expression_statement (string) @documentation)))
(function_definition
  body: (block . (expression_statement (string) @documentation)))
`

const TOKENIZER_LANGUAGE_MAPPINGS_INTERNAL = {
  c: {
    assetLanguage: "c",
    ...C_FAMILY_MAPPING,
  },
  cpp: {
    assetLanguage: "cpp",
    commentNodeKinds: ["comment"],
    documentationNodeKinds: [],
    stringNodeKinds: [
      "char_literal",
      "concatenated_string",
      "raw_string_literal",
      "string_literal",
      "system_lib_string",
    ],
    embeddedExpressionNodeKinds: [],
  },
  cs: {
    assetLanguage: "cs",
    commentNodeKinds: ["comment"],
    documentationNodeKinds: [],
    stringNodeKinds: [
      "character_literal",
      "interpolated_string_expression",
      "raw_string_literal",
      "string_literal",
      "verbatim_string_literal",
    ],
    embeddedExpressionNodeKinds: ["interpolation"],
  },
  go: {
    assetLanguage: "go",
    commentNodeKinds: ["comment"],
    documentationNodeKinds: [],
    stringNodeKinds: [
      "interpreted_string_literal",
      "raw_string_literal",
      "rune_literal",
    ],
    embeddedExpressionNodeKinds: [],
  },
  haskell: {
    assetLanguage: "haskell",
    commentNodeKinds: ["comment", "haddock"],
    documentationNodeKinds: [],
    stringNodeKinds: ["char", "quasiquote", "string"],
    embeddedExpressionNodeKinds: [],
  },
  java: {
    assetLanguage: "java",
    commentNodeKinds: ["block_comment", "line_comment"],
    documentationNodeKinds: [],
    stringNodeKinds: [
      "character_literal",
      "string_literal",
      "template_expression",
    ],
    embeddedExpressionNodeKinds: ["string_interpolation"],
  },
  js: {
    assetLanguage: "js",
    ...JS_FAMILY_MAPPING,
  },
  jsx: {
    assetLanguage: "jsx",
    ...JS_FAMILY_MAPPING,
  },
  kotlin: {
    assetLanguage: "kotlin",
    commentNodeKinds: ["block_comment", "line_comment"],
    documentationNodeKinds: [],
    stringNodeKinds: [
      "character_literal",
      "multiline_string_literal",
      "string_literal",
    ],
    embeddedExpressionNodeKinds: ["interpolation"],
  },
  php: {
    assetLanguage: "php",
    commentNodeKinds: ["comment"],
    documentationNodeKinds: [],
    stringNodeKinds: [
      "encapsed_string",
      "heredoc",
      "heredoc_body",
      "nowdoc",
      "nowdoc_body",
      "nowdoc_string",
      "string",
    ],
    embeddedExpressionNodeKinds: [
      "comment",
      "dynamic_variable_name",
      "text_interpolation",
      "variable_name",
    ],
  },
  py: {
    assetLanguage: "py",
    commentNodeKinds: ["comment"],
    documentationNodeKinds: [],
    stringNodeKinds: ["concatenated_string", "string"],
    embeddedExpressionNodeKinds: ["interpolation"],
    documentationQuerySource: PYTHON_DOCUMENTATION_QUERY,
  },
  r: {
    assetLanguage: "r",
    commentNodeKinds: ["comment"],
    documentationNodeKinds: [],
    stringNodeKinds: ["string"],
    embeddedExpressionNodeKinds: [],
  },
  rb: {
    assetLanguage: "rb",
    commentNodeKinds: ["comment"],
    documentationNodeKinds: [],
    stringNodeKinds: [
      "bare_string",
      "character",
      "chained_string",
      "heredoc_body",
      "regex",
      "string",
      "string_array",
    ],
    embeddedExpressionNodeKinds: ["interpolation"],
  },
  robot: {
    assetLanguage: "robot",
    commentNodeKinds: ["comment"],
    documentationNodeKinds: [],
    stringNodeKinds: [],
    embeddedExpressionNodeKinds: [],
  },
  rs: {
    assetLanguage: "rs",
    commentNodeKinds: ["block_comment", "line_comment"],
    documentationNodeKinds: ["doc_comment"],
    stringNodeKinds: ["char_literal", "raw_string_literal", "string_literal"],
    embeddedExpressionNodeKinds: [],
  },
  shell: {
    assetLanguage: "shell",
    commentNodeKinds: ["comment"],
    documentationNodeKinds: [],
    stringNodeKinds: [
      "ansi_c_string",
      "heredoc_body",
      "raw_string",
      "regex",
      "string",
      "translated_string",
    ],
    embeddedExpressionNodeKinds: [
      "command_substitution",
      "process_substitution",
    ],
  },
  toml: {
    assetLanguage: "toml",
    commentNodeKinds: ["comment"],
    documentationNodeKinds: [],
    stringNodeKinds: ["string"],
    embeddedExpressionNodeKinds: [],
  },
  ts: {
    assetLanguage: "ts",
    ...JS_FAMILY_MAPPING,
  },
  tsx: {
    assetLanguage: "tsx",
    ...JS_FAMILY_MAPPING,
  },
  xml: {
    assetLanguage: "xml",
    commentNodeKinds: ["Comment"],
    documentationNodeKinds: [],
    stringNodeKinds: ["AttValue", "PubidLiteral", "SystemLiteral"],
    embeddedExpressionNodeKinds: [],
  },
} as const satisfies Record<
  TokenizerSupportedLanguage,
  TokenizerLanguageMapping
>

export const TOKENIZER_LANGUAGE_MAPPINGS: Record<
  TokenizerSupportedLanguage,
  TokenizerLanguageMapping
> = TOKENIZER_LANGUAGE_MAPPINGS_INTERNAL
