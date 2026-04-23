import type { ExaminationCodeExcerpt } from "@repo-edu/application-contract"
import type { BlameResult, PersonDbSnapshot } from "@repo-edu/domain/analysis"

// Per-member excerpt budget. Larger values give the LLM richer context but
// cost more tokens and wall time; the cap also protects against blame results
// dominated by a single author on a huge file.
const MAX_TOTAL_LINES = 400
const MAX_EXCERPTS = 30
const MAX_LINES_PER_EXCERPT = 40

function normalizeNameForKey(name: string): string {
  return name.trim().split(/\s+/).join(" ").toLowerCase()
}

function normalizeEmailForKey(email: string): string {
  return email.trim().toLowerCase()
}

function identityKey(name: string, email: string): string {
  return `${normalizeEmailForKey(email)}\0${normalizeNameForKey(name)}`
}

export function buildMemberExcerpts(
  blameResult: BlameResult,
  personDb: PersonDbSnapshot,
  personId: string,
): ExaminationCodeExcerpt[] {
  const excerpts: ExaminationCodeExcerpt[] = []
  let totalLines = 0

  for (const fileBlame of blameResult.fileBlames) {
    if (excerpts.length >= MAX_EXCERPTS || totalLines >= MAX_TOTAL_LINES) {
      break
    }

    let currentStart: number | null = null
    let currentLines: string[] = []
    const flushRun = () => {
      if (currentStart === null || currentLines.length === 0) return
      const sliced = currentLines.slice(0, MAX_LINES_PER_EXCERPT)
      excerpts.push({
        filePath: fileBlame.path,
        startLine: currentStart,
        lines: sliced,
      })
      totalLines += sliced.length
      currentStart = null
      currentLines = []
    }

    for (const line of fileBlame.lines) {
      if (excerpts.length >= MAX_EXCERPTS || totalLines >= MAX_TOTAL_LINES) {
        break
      }
      const key = identityKey(line.authorName, line.authorEmail)
      const linePersonId = personDb.identityIndex.get(key)
      if (linePersonId !== personId) {
        flushRun()
        continue
      }
      if (currentStart === null) {
        currentStart = line.lineNumber
        currentLines = [line.content]
      } else if (line.lineNumber === currentStart + currentLines.length) {
        currentLines.push(line.content)
      } else {
        flushRun()
        currentStart = line.lineNumber
        currentLines = [line.content]
      }
    }
    flushRun()
  }

  return excerpts
}
