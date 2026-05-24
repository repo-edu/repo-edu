import type { Node, Parser } from "web-tree-sitter"
import { Query } from "web-tree-sitter"
import {
  extensionToLanguage,
  type SupportedLanguage,
} from "./language-catalog.js"
import { TOKENIZER_LANGUAGE_MAPPINGS } from "./tokenizer-language-mappings.js"

export type TokenKind = "code" | "string-literal" | "comment" | "documentation"

export type Token = {
  readonly kind: TokenKind
  readonly start: number
  readonly end: number
}

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

export type LoadedTokenizerLanguage = {
  readonly language: TokenizerSupportedLanguage
  readonly parser: Parser
}

const TOKENIZER_SUPPORTED_LANGUAGE_SET = new Set<SupportedLanguage>(
  TOKENIZER_SUPPORTED_LANGUAGES,
)

const TOKENIZER_EXTENSION_EXCLUSIONS = new Set([
  "htm",
  "html",
  "lhs",
  "rlib",
  "xhtml",
  "jspx",
])

type InternalKind = TokenKind

type RawRange = {
  readonly kind: InternalKind
  readonly start: number
  readonly end: number
  readonly precedence: number
}

type Segment = RawRange

const PRECEDENCE: Record<InternalKind, number> = {
  code: 4,
  documentation: 3,
  comment: 2,
  "string-literal": 1,
}

const textEncoder = new TextEncoder()

export function isTokenizerSupportedLanguage(
  language: SupportedLanguage,
): language is TokenizerSupportedLanguage {
  return TOKENIZER_SUPPORTED_LANGUAGE_SET.has(language)
}

export function extensionToTokenizerLanguage(
  extension: string,
): TokenizerSupportedLanguage | undefined {
  const normalized = extension.trim().toLowerCase().replace(/^\./, "")
  if (TOKENIZER_EXTENSION_EXCLUSIONS.has(normalized)) return undefined

  const language = extensionToLanguage(normalized)
  if (!language || !isTokenizerSupportedLanguage(language)) return undefined
  return language
}

function buildByteToUtf16Map(source: string): number[] {
  const map: number[] = [0]
  let byteOffset = 0

  for (let index = 0; index < source.length; ) {
    const codePoint = source.codePointAt(index)
    if (codePoint === undefined) break

    const character = String.fromCodePoint(codePoint)
    const byteLength = textEncoder.encode(character).byteLength
    const nextIndex = index + character.length

    for (let i = 0; i < byteLength; i++) {
      map[byteOffset + i] = index
    }
    byteOffset += byteLength
    map[byteOffset] = nextIndex
    index = nextIndex
  }

  return map
}

function buildParserIndexToUtf16Map(
  source: string,
  parserEndIndex: number,
): number[] {
  if (parserEndIndex === source.length) {
    return Array.from({ length: source.length + 1 }, (_, index) => index)
  }
  return buildByteToUtf16Map(source)
}

function utf16OffsetForByte(byteToUtf16: readonly number[], byte: number) {
  return byteToUtf16[byte] ?? byteToUtf16[byteToUtf16.length - 1] ?? 0
}

function pushRawRange(
  ranges: RawRange[],
  byteToUtf16: readonly number[],
  kind: InternalKind,
  startByte: number,
  endByte: number,
) {
  const start = utf16OffsetForByte(byteToUtf16, startByte)
  const end = utf16OffsetForByte(byteToUtf16, endByte)
  if (end <= start) return
  ranges.push({ kind, start, end, precedence: PRECEDENCE[kind] })
}

function isPythonPlainDocumentationString(node: Node): boolean {
  const text = node.text.trimStart()
  const quoteIndex = text.search(/["']/)
  if (quoteIndex < 0) return false

  const prefix = text.slice(0, quoteIndex).toLowerCase()
  if (prefix.includes("b") || prefix.includes("f")) return false
  return [...prefix].every((char) => char === "r" || char === "u")
}

function collectDocumentationRanges(
  loaded: LoadedTokenizerLanguage,
  rootNode: Node,
  byteToUtf16: readonly number[],
  ranges: RawRange[],
) {
  const mapping = TOKENIZER_LANGUAGE_MAPPINGS[loaded.language]

  if (mapping.documentationQuerySource === undefined) return
  const language = loaded.parser.language
  if (language === null) {
    throw new Error("tokenizeSource requires a parser with a loaded language.")
  }

  const query = new Query(language, mapping.documentationQuerySource)
  try {
    for (const capture of query.captures(rootNode)) {
      if (capture.name !== "documentation") continue
      if (
        loaded.language === "py" &&
        !isPythonPlainDocumentationString(capture.node)
      ) {
        continue
      }
      pushRawRange(
        ranges,
        byteToUtf16,
        "documentation",
        capture.node.startIndex,
        capture.node.endIndex,
      )
    }
  } finally {
    query.delete()
  }
}

function collectNodeRanges(
  node: Node,
  loaded: LoadedTokenizerLanguage,
  byteToUtf16: readonly number[],
  ranges: RawRange[],
) {
  if (node.isMissing) return

  const mapping = TOKENIZER_LANGUAGE_MAPPINGS[loaded.language]
  const startByte = node.startIndex
  const endByte = node.endIndex
  const nodeType = node.type

  if (endByte > startByte && node.isError) {
    pushRawRange(ranges, byteToUtf16, "code", startByte, endByte)
    return
  }

  if (mapping.documentationNodeKinds.includes(nodeType)) {
    pushRawRange(ranges, byteToUtf16, "documentation", startByte, endByte)
    return
  }

  if (
    mapping.commentNodeKinds.includes(nodeType) &&
    node.children.some((child) =>
      mapping.documentationNodeKinds.includes(child.type),
    )
  ) {
    pushRawRange(ranges, byteToUtf16, "documentation", startByte, endByte)
    return
  }

  if (mapping.commentNodeKinds.includes(nodeType)) {
    pushRawRange(ranges, byteToUtf16, "comment", startByte, endByte)
    return
  }

  if (mapping.stringNodeKinds.includes(nodeType)) {
    collectStringNodeRanges(node, loaded, byteToUtf16, ranges)
    return
  }

  for (const child of node.children) {
    collectNodeRanges(child, loaded, byteToUtf16, ranges)
  }
}

function collectStringNodeRanges(
  node: Node,
  loaded: LoadedTokenizerLanguage,
  byteToUtf16: readonly number[],
  ranges: RawRange[],
) {
  const mapping = TOKENIZER_LANGUAGE_MAPPINGS[loaded.language]
  const embeddedChildren = node.children.filter((child) =>
    mapping.embeddedExpressionNodeKinds.includes(child.type),
  )

  if (embeddedChildren.length === 0) {
    pushRawRange(
      ranges,
      byteToUtf16,
      "string-literal",
      node.startIndex,
      node.endIndex,
    )
    return
  }

  let cursor = node.startIndex
  for (const child of embeddedChildren.toSorted(
    (a, b) => a.startIndex - b.startIndex,
  )) {
    pushRawRange(
      ranges,
      byteToUtf16,
      "string-literal",
      cursor,
      child.startIndex,
    )
    collectNodeRanges(child, loaded, byteToUtf16, ranges)
    cursor = Math.max(cursor, child.endIndex)
  }
  pushRawRange(ranges, byteToUtf16, "string-literal", cursor, node.endIndex)
}

function applyRange(segments: Segment[], range: RawRange): Segment[] {
  const next: Segment[] = []

  for (const segment of segments) {
    if (range.end <= segment.start || range.start >= segment.end) {
      next.push(segment)
      continue
    }

    if (segment.start < range.start) {
      next.push({
        ...segment,
        end: range.start,
      })
    }

    next.push({
      kind: range.kind,
      start: Math.max(segment.start, range.start),
      end: Math.min(segment.end, range.end),
      precedence: range.precedence,
    })

    if (range.end < segment.end) {
      next.push({
        ...segment,
        start: range.end,
      })
    }
  }

  return compactSegments(next)
}

function compactSegments(segments: Segment[]): Segment[] {
  const compacted: Segment[] = []
  for (const segment of segments) {
    if (segment.end <= segment.start) continue

    const previous = compacted[compacted.length - 1]
    if (
      previous &&
      previous.kind === segment.kind &&
      previous.end === segment.start &&
      previous.precedence === segment.precedence
    ) {
      compacted[compacted.length - 1] = { ...previous, end: segment.end }
    } else {
      compacted.push(segment)
    }
  }
  return compacted
}

function normaliseRanges(sourceLength: number, rawRanges: RawRange[]): Token[] {
  if (sourceLength === 0) return []

  let segments: Segment[] = [
    { kind: "code", start: 0, end: sourceLength, precedence: 0 },
  ]

  const sortedRanges = rawRanges
    .filter((range) => range.end > range.start)
    .map((range) => ({
      ...range,
      start: Math.max(0, Math.min(sourceLength, range.start)),
      end: Math.max(0, Math.min(sourceLength, range.end)),
    }))
    .filter((range) => range.end > range.start)
    .toSorted((a, b) => {
      if (a.precedence !== b.precedence) return a.precedence - b.precedence
      if (a.start !== b.start) return a.start - b.start
      return a.end - b.end
    })

  for (const range of sortedRanges) {
    segments = applyRange(segments, range)
  }

  return compactSegments(segments).map(({ kind, start, end }) => ({
    kind,
    start,
    end,
  }))
}

export function tokenizeSource(
  source: string,
  loaded: LoadedTokenizerLanguage,
): Token[] {
  const mapping = TOKENIZER_LANGUAGE_MAPPINGS[loaded.language]
  if (!mapping) {
    throw new Error(`Unsupported tokenizer language: ${loaded.language}`)
  }

  loaded.parser.reset()
  const tree = loaded.parser.parse(source)
  if (tree === null) {
    return source.length === 0
      ? []
      : [{ kind: "code", start: 0, end: source.length }]
  }

  const ranges: RawRange[] = []

  try {
    const rootNode = tree.rootNode
    const byteToUtf16 = buildParserIndexToUtf16Map(source, rootNode.endIndex)
    collectDocumentationRanges(loaded, rootNode, byteToUtf16, ranges)
    collectNodeRanges(rootNode, loaded, byteToUtf16, ranges)
  } finally {
    tree.delete()
  }

  return normaliseRanges(source.length, ranges)
}
