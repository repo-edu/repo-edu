import type { LoadedTokenizerLanguage, Token } from "./language-tokenizer.js"
import { tokenizeSource } from "./language-tokenizer.js"

function isCommentLike(kind: Token["kind"]): boolean {
  return kind === "comment" || kind === "documentation"
}

function advanceTokenIndex(
  tokens: readonly Token[],
  tokenIndex: number,
  offset: number,
): number {
  let index = tokenIndex
  while (index < tokens.length && tokens[index].end <= offset) index += 1
  return index
}

function isRangeCoveredByCommentLike(
  tokens: readonly Token[],
  tokenIndex: number,
  start: number,
  end: number,
) {
  if (end <= start) return false

  let cursor = start
  let index = advanceTokenIndex(tokens, tokenIndex, cursor)
  while (cursor < end) {
    const token = tokens[index]
    if (token === undefined) return false
    if (token.start > cursor) return false
    if (!isCommentLike(token.kind)) return false

    cursor = Math.min(end, token.end)
    if (cursor >= end) return true
    index = advanceTokenIndex(tokens, index, cursor)
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
  let tokenIndex = 0

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
      tokenIndex = advanceTokenIndex(tokens, tokenIndex, offset)
      const token = tokens[tokenIndex]
      if (
        token === undefined ||
        token.start > offset ||
        !isCommentLike(token.kind)
      ) {
        allNonWhitespaceInComment = false
        break
      }
    }

    if (hasNonWhitespace) {
      if (allNonWhitespaceInComment) commentIndices.add(i)
      continue
    }

    const regionEnd = end < source.length ? end + 1 : end
    tokenIndex = advanceTokenIndex(tokens, tokenIndex, start)
    if (isRangeCoveredByCommentLike(tokens, tokenIndex, start, regionEnd)) {
      commentIndices.add(i)
    }
  }

  return commentIndices
}
