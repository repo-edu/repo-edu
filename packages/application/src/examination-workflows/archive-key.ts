import type { ExaminationCodeExcerpt } from "@repo-edu/application-contract"

// The fingerprint is one field of a composite archive key
// {groupSetId, personId, commitOid, questionCount, excerptsFingerprint};
// a collision on the fingerprint alone can't produce a wrong hit unless
// every other field also matches, so a single 32-bit FNV-1a is enough.
function fnv1a32Hex(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

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
      ].join(""),
    )
    .join("")
  return fnv1a32Hex(serialized)
}
