import type { FileBlame, PersonDbSnapshot } from "@repo-edu/domain/analysis"
import { lookupPerson } from "@repo-edu/domain/analysis"

export type ProcessedLine = {
  line: FileBlame["lines"][number]
  personId: string
  isFirstInGroup: boolean
  authorRank: number
  commitNumber: number
  isComment: boolean
  isEmpty: boolean
}

export function processBlameLines(
  fileBlame: FileBlame,
  personDb: PersonDbSnapshot,
  commitNumberMap: ReadonlyMap<string, number>,
  commentClassification: ReadonlySet<number> | null,
): ProcessedLine[] {
  const authorLineCounts = new Map<string, number>()
  const linePersonIds: string[] = []

  for (const line of fileBlame.lines) {
    const person = lookupPerson(personDb, line.authorName, line.authorEmail)
    const pid = person?.id ?? `unknown:${line.authorEmail}`
    linePersonIds.push(pid)
    authorLineCounts.set(pid, (authorLineCounts.get(pid) ?? 0) + 1)
  }

  const sortedAuthors = [...authorLineCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )
  const authorRankMap = new Map<string, number>()
  for (let i = 0; i < sortedAuthors.length; i++) {
    authorRankMap.set(sortedAuthors[i][0], i + 1)
  }

  const processed: ProcessedLine[] = []
  for (const [i, line] of fileBlame.lines.entries()) {
    const personId = linePersonIds[i] ?? `unknown:${line.authorEmail}`
    const isFirstInGroup = i === 0 || fileBlame.lines[i - 1]?.sha !== line.sha
    const isComment = commentClassification?.has(i) ?? false
    const isEmpty = line.content.trim().length === 0

    processed.push({
      line,
      personId,
      isFirstInGroup,
      authorRank: authorRankMap.get(personId) ?? 0,
      commitNumber: commitNumberMap.get(line.sha) ?? 0,
      isComment,
      isEmpty,
    })
  }

  return processed
}
