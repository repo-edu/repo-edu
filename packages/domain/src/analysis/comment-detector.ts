import {
  type CommentMarker,
  LANGUAGE_CATALOG,
  type SupportedLanguage,
} from "./language-catalog.js"

export { extensionToLanguage } from "./language-catalog.js"

export function classifyCommentLines(
  lines: string[],
  language: SupportedLanguage,
): Set<number> {
  const marker: CommentMarker = LANGUAGE_CATALOG[language].comment
  const commentIndices = new Set<number>()
  let inBlock = false
  const mustBeAtBeginning = marker.mustBeAtBeginning === true

  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i].trimStart()

    if (!inBlock) {
      if (marker.line !== null && stripped.startsWith(marker.line)) {
        commentIndices.add(i)
      } else if (marker.start !== null && stripped.startsWith(marker.start)) {
        commentIndices.add(i)
        const afterStart = stripped.slice(marker.start.length).trim()
        if (marker.end === null || !afterStart.endsWith(marker.end)) {
          inBlock = true
        }
      } else if (
        !mustBeAtBeginning &&
        marker.start !== null &&
        stripped.includes(marker.start)
      ) {
        inBlock = true
      }
    } else {
      commentIndices.add(i)
      if (marker.end !== null && stripped.endsWith(marker.end)) {
        inBlock = false
      }
    }
  }

  return commentIndices
}
