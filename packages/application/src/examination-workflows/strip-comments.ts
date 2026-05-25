import type { ExaminationCodeExcerpt } from "@repo-edu/application-contract"
import {
  extensionToTokenizerLanguage,
  type Token,
  tokenizeSource,
} from "@repo-edu/domain/analysis"
import type { TokenizerPort } from "@repo-edu/host-runtime-contract"
import type { ClassifiedSourceSpan, SourceSpanKind } from "./redaction.js"

export type StripCommentsResult = {
  lines: string[]
  spans: ClassifiedSourceSpan[]
  tokenizerTreatment: "stripped" | "fallback"
}

function finalExtension(filePath: string): string {
  const basename = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath
  const index = basename.lastIndexOf(".")
  return index < 0 ? "" : basename.slice(index + 1)
}

function lineStarts(source: string): number[] {
  const starts: number[] = [0]
  for (let index = 0; index < source.length; index++) {
    if (source[index] === "\n") starts.push(index + 1)
  }
  return starts
}

function fallback(excerpt: ExaminationCodeExcerpt): StripCommentsResult {
  const text = excerpt.lines.join("\n")
  return {
    lines: [...excerpt.lines],
    spans:
      text.length === 0 ? [] : [{ start: 0, end: text.length, kind: "code" }],
    tokenizerTreatment: "fallback",
  }
}

function blankRange(chars: string[], start: number, end: number): void {
  for (let index = start; index < end; index++) {
    if (chars[index] !== "\n") chars[index] = " "
  }
}

function projectToken(params: {
  token: Token
  windowStart: number
  windowEnd: number
}): (Token & { start: number; end: number }) | null {
  const start = Math.max(params.token.start, params.windowStart)
  const end = Math.min(params.token.end, params.windowEnd)
  if (end <= start) return null
  return {
    ...params.token,
    start: start - params.windowStart,
    end: end - params.windowStart,
  }
}

function sourceSpansFromTokens(
  tokens: readonly Token[],
): ClassifiedSourceSpan[] {
  return tokens.flatMap((token) => {
    if (token.kind !== "code" && token.kind !== "string-literal") return []
    return [
      {
        start: token.start,
        end: token.end,
        kind: token.kind satisfies SourceSpanKind,
      },
    ]
  })
}

export async function stripCommentsForExcerpt(params: {
  excerpt: ExaminationCodeExcerpt
  fileSource: string | undefined
  tokenizer: TokenizerPort
}): Promise<StripCommentsResult> {
  const language = extensionToTokenizerLanguage(
    finalExtension(params.excerpt.filePath),
  )
  if (language === undefined || params.fileSource === undefined) {
    return fallback(params.excerpt)
  }

  const fullSource = params.fileSource.replace(/\r\n?/g, "\n")
  const starts = lineStarts(fullSource)
  const windowStart = starts[params.excerpt.startLine - 1]
  if (windowStart === undefined) {
    return fallback(params.excerpt)
  }
  const originalText = params.excerpt.lines.join("\n")
  const windowEnd = windowStart + originalText.length

  try {
    const loaded = await params.tokenizer.loadTokenizerLanguage(language)
    const projected = tokenizeSource(fullSource, loaded)
      .map((token) => projectToken({ token, windowStart, windowEnd }))
      .filter((token): token is Token => token !== null)
    const chars = originalText.split("")
    for (const token of projected) {
      if (token.kind === "comment" || token.kind === "documentation") {
        blankRange(chars, token.start, token.end)
      }
    }
    return {
      lines: chars.join("").split("\n"),
      spans: sourceSpansFromTokens(projected),
      tokenizerTreatment: "stripped",
    }
  } catch {
    return fallback(params.excerpt)
  }
}
