import type { ExaminationCodeExcerpt } from "@repo-edu/application-contract"
import { hashCacheKey } from "../cache/layered-cache.js"

/**
 * Canonicalize excerpts by sorting on (filePath, startLine). The excerpt
 * content itself drives the fingerprint; the renderer builds excerpts in
 * file/line order already, but sorting defensively means callers never
 * spuriously miss the archive due to input reordering.
 */
export function canonicalizeExaminationExcerpts(
  excerpts: readonly ExaminationCodeExcerpt[],
): ExaminationCodeExcerpt[] {
  return [...excerpts]
    .map((excerpt) => ({
      filePath: excerpt.filePath,
      startLine: excerpt.startLine,
      lines: [...excerpt.lines],
    }))
    .sort((a, b) => {
      if (a.filePath !== b.filePath) {
        return a.filePath < b.filePath ? -1 : 1
      }
      return a.startLine - b.startLine
    })
}

export function buildExaminationExcerptsFingerprint(
  excerpts: readonly ExaminationCodeExcerpt[],
): string {
  const canonical = canonicalizeExaminationExcerpts(excerpts)
  const serialized = canonical
    .map((excerpt) =>
      [
        excerpt.filePath,
        String(excerpt.startLine),
        String(excerpt.lines.length),
        excerpt.lines.join("\n"),
      ].join("\u001f"),
    )
    .join("\u001e")
  return hashCacheKey(serialized)
}
