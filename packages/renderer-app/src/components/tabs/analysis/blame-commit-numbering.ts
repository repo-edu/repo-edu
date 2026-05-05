import type { FileBlame } from "@repo-edu/domain/analysis"

export function buildBlameCommitNumberMap(
  fileBlames: Iterable<FileBlame>,
): Map<string, number> {
  const shaTimestamps = new Map<string, number>()

  for (const fileBlame of fileBlames) {
    for (const line of fileBlame.lines) {
      const existing = shaTimestamps.get(line.sha)
      if (existing === undefined || line.timestamp < existing) {
        shaTimestamps.set(line.sha, line.timestamp)
      }
    }
  }

  const sortedShas = [...shaTimestamps.entries()].sort(
    (left, right) => left[1] - right[1] || left[0].localeCompare(right[0]),
  )
  return new Map(sortedShas.map(([sha], index) => [sha, index + 1]))
}
