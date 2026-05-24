import type { LoadedTokenizerLanguage, Token } from "./language-tokenizer.js"
import { tokenizeSource } from "./language-tokenizer.js"

function isCommentLike(kind: Token["kind"]): boolean {
  return kind === "comment" || kind === "documentation"
}

function tokenAt(tokens: readonly Token[], offset: number): Token | undefined {
  return tokens.find((token) => token.start <= offset && offset < token.end)
}

function isOffsetInCommentLike(tokens: readonly Token[], offset: number) {
  const token = tokenAt(tokens, offset)
  return token !== undefined && isCommentLike(token.kind)
}

function isRangeCoveredByCommentLike(
  tokens: readonly Token[],
  start: number,
  end: number,
) {
  if (end <= start) return false

  let cursor = start
  for (const token of tokens) {
    if (token.end <= cursor) continue
    if (token.start > cursor) return false
    if (!isCommentLike(token.kind)) return false

    cursor = Math.min(end, token.end)
    if (cursor >= end) return true
  }

  return false
}

function lineStarts(lines: readonly string[]) {
  const starts: number[] = []
  let offset = 0

  for (const line of lines) {
    starts.push(offset)
    offset += line.length + 1
  }

  return starts
}

export function classifyCommentLines(
  lines: string[],
  loaded: LoadedTokenizerLanguage,
): Set<number> {
  const source = lines.join("\n")
  const tokens = tokenizeSource(source, loaded)
  const starts = lineStarts(lines)
  const commentIndices = new Set<number>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const start = starts[i]
    const end = start + line.length
    let hasNonWhitespace = false
    let allNonWhitespaceInComment = true

    for (let offset = start; offset < end; offset++) {
      const character = source[offset]
      if (character === undefined || /\s/.test(character)) continue

      hasNonWhitespace = true
      if (!isOffsetInCommentLike(tokens, offset)) {
        allNonWhitespaceInComment = false
        break
      }
    }

    if (hasNonWhitespace) {
      if (allNonWhitespaceInComment) commentIndices.add(i)
      continue
    }

    const regionEnd = end < source.length ? end + 1 : end
    if (isRangeCoveredByCommentLike(tokens, start, regionEnd)) {
      commentIndices.add(i)
    }
  }

  return commentIndices
}
