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

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function fnmatchToRegex(pattern: string): RegExp {
  let regex = ""
  let i = 0

  while (i < pattern.length) {
    const char = pattern[i]

    if (char === "*") {
      regex += "[\\s\\S]*"
    } else if (char === "?") {
      regex += "[\\s\\S]"
    } else if (char === "[") {
      let j = i + 1
      if (j < pattern.length && pattern[j] === "!") {
        j++
      }
      if (j < pattern.length && pattern[j] === "]") {
        j++
      }
      while (j < pattern.length && pattern[j] !== "]") {
        j++
      }

      if (j >= pattern.length) {
        regex += escapeRegex(char)
      } else {
        let classBody = pattern.slice(i + 1, j)
        if (classBody.startsWith("!")) {
          classBody = `^${classBody.slice(1)}`
        }
        regex += `[${classBody}]`
        i = j
      }
    } else {
      regex += escapeRegex(char)
    }

    i++
  }

  return new RegExp(`^${regex}$`, "i")
}

const PATTERN_CACHE_MAX = 64
const patternCache = new Map<string, RegExp>()

function matchesPattern(value: string, pattern: string): boolean {
  let regex = patternCache.get(pattern)
  if (!regex) {
    regex = fnmatchToRegex(pattern)
    if (patternCache.size >= PATTERN_CACHE_MAX) {
      const first = patternCache.keys().next().value
      if (first !== undefined) patternCache.delete(first)
    }
    patternCache.set(pattern, regex)
  }
  return regex.test(value)
}

function matchesAnyPattern(
  value: string,
  patterns: readonly string[],
): boolean {
  return patterns.some((pattern) => matchesPattern(value, pattern))
}

export function processBlameLines(
  fileBlame: FileBlame,
  personDb: PersonDbSnapshot,
  commitNumberMap: ReadonlyMap<string, number>,
  commentClassification: ReadonlySet<number> | null,
  options: {
    excludeAuthors: readonly string[]
    excludeEmails: readonly string[]
  },
): ProcessedLine[] {
  const lines = fileBlame.lines.filter((line) => {
    if (
      options.excludeAuthors.length > 0 &&
      matchesAnyPattern(line.authorName, options.excludeAuthors)
    ) {
      return false
    }
    if (
      options.excludeEmails.length > 0 &&
      matchesAnyPattern(line.authorEmail, options.excludeEmails)
    ) {
      return false
    }
    return true
  })

  const authorLineCounts = new Map<string, number>()
  const linePersonIds: string[] = []

  for (const line of lines) {
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
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const personId = linePersonIds[i]
    const isFirstInGroup = i === 0 || lines[i - 1].sha !== line.sha
    const isComment = commentClassification?.has(line.lineNumber - 1) ?? false
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
