import {
  capabilityTag,
  type ReportFinding,
  type RulingWinner,
} from "./round-data.js"

/** One winner the ruler named, with its one-line reason. */
export type RulerWinner = {
  readonly number: number
  readonly tier: ReportFinding["tier"]
  readonly winner: RulingWinner
  readonly reason: string
}

/**
 * What a ruler report gives the runner: one winner for each finding the ruler
 * was given, in audit report order, and every source the report names as
 * opened, each once, in report order. The sources are what the reading check
 * compares with the ruler's own session.
 */
export type RulerReading = {
  readonly winners: readonly RulerWinner[]
  readonly sources: readonly string[]
}

type Entry = {
  readonly number: number
  readonly tier: ReportFinding["tier"]
  winner: Omit<RulerWinner, "number" | "tier"> | null
  winnerLines: number
  sourceCount: number
}

const headingPattern = /^### ([1-9]\d*)\. \[([A-D])\](?: .*)?$/
const sourcePattern = /^(?:- )?Opened:(.*)$/
const winnerPattern = /^Winner:(.*)$/

function listWords(names: readonly string[]): string {
  return names.length === 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`
}

/**
 * A source names a file by its absolute path or a commit by its first six
 * characters, in backticks, so the reading check can match it as plain text
 * against the ruler's logged tool lines without resolving anything.
 */
function readSource(rest: string, entry: Entry | undefined): string {
  const named = /^ `([^`]+)`(?:, .+)?$/.exec(rest.trimEnd())
  const source = named?.[1]
  if (
    source === undefined ||
    !(/^\/\S/.test(source) || /^[0-9a-f]{6}$/.test(source))
  )
    throw new Error(
      `${entry === undefined ? "Ruler report" : `Ruler finding ${entry.number}`} has a source that is no absolute path or six-character commit`,
    )
  return source
}

function readWinner(
  entry: Entry,
  rest: string,
  panel: readonly string[],
): Omit<RulerWinner, "number" | "tier"> {
  const line = /^ (.+?)\.\s+(\S.*)$/.exec(rest.trimEnd())
  const words = line?.[1] ?? rest.trim()
  const reason = line?.[2]
  const winner: RulingWinner =
    words === "report" || words === "neither" ? words : words.split(", ")
  if (Array.isArray(winner)) {
    for (const word of winner) {
      if (!capabilityTag.safeParse(word).success)
        throw new Error(
          `Ruler finding ${entry.number} names the winner "${words}"; use report, neither or tags of ${listWords(panel)}`,
        )
      if (!panel.includes(word))
        throw new Error(
          `Ruler finding ${entry.number} names ${word}, which is no vetter of this round; use ${listWords(panel)}`,
        )
    }
  }
  if (reason === undefined)
    throw new Error(
      `Ruler finding ${entry.number} needs a one-line reason after its winner`,
    )
  return { winner, reason }
}

/**
 * Read the ruler report against the findings the ruler was given and the
 * round's panel. Each given finding opens its entry with a depth-3 heading
 * that repeats its audit report number and tier. The entry holds the finding's
 * evidence record, at least one source line and exactly one winner line. Every
 * other line is free text for the fix. A source line before the first heading
 * still counts among the report's sources.
 */
export function readRulerReport(
  source: string,
  given: readonly Pick<ReportFinding, "number" | "tier">[],
  panel: readonly string[],
): RulerReading {
  const entries: Entry[] = []
  const sources: string[] = []
  let lastPosition = -1
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim()
    const heading = headingPattern.exec(line)
    if (heading !== null) {
      const number = Number(heading[1])
      const tier = heading[2] as ReportFinding["tier"]
      const finding = given.find((candidate) => candidate.number === number)
      if (finding === undefined)
        throw new Error(
          `Ruler report answers finding ${number}, which the ruler was not given`,
        )
      if (finding.tier !== tier)
        throw new Error(
          `Ruler finding ${number} has tier [${tier}]; the audit report graded it [${finding.tier}]`,
        )
      const position = given.indexOf(finding)
      if (position <= lastPosition)
        throw new Error(
          "Ruler findings must follow audit report order, each once",
        )
      lastPosition = position
      entries.push({
        number,
        tier,
        winner: null,
        winnerLines: 0,
        sourceCount: 0,
      })
      continue
    }
    const entry = entries.at(-1)
    const opened = sourcePattern.exec(line)
    if (opened !== null) {
      const name = readSource(opened[1] as string, entry)
      if (!sources.includes(name)) sources.push(name)
      if (entry !== undefined) entry.sourceCount += 1
      continue
    }
    const winner = winnerPattern.exec(line)
    if (winner === null) continue
    if (entry === undefined)
      throw new Error("Ruler report names a winner before its first finding")
    entry.winnerLines += 1
    entry.winner = readWinner(entry, winner[1] as string, panel)
  }
  for (const finding of given)
    if (!entries.some((entry) => entry.number === finding.number))
      throw new Error(
        `Ruler report needs an entry for finding ${finding.number}`,
      )
  return {
    winners: entries.map((entry) => {
      if (entry.winnerLines !== 1 || entry.winner === null)
        throw new Error(`Ruler finding ${entry.number} needs one Winner: line`)
      if (entry.sourceCount === 0)
        throw new Error(`Ruler finding ${entry.number} names no opened source`)
      return { number: entry.number, tier: entry.tier, ...entry.winner }
    }),
    sources,
  }
}

/**
 * The reading check: the sources a ruler report names that the ruler's session
 * did not open. A source counts as opened when its name appears as text in one
 * of the session's tool lines, or when it is the path of a file the runner
 * supplied whole in the first prompt. The test is plain text: it resolves no
 * relative path and follows no `cd`, so the report's fixed source form is what
 * makes a read count.
 */
export function unopenedSources(
  sources: readonly string[],
  toolLines: readonly string[],
  supplied: readonly string[],
): readonly string[] {
  return sources.filter(
    (source) =>
      !supplied.includes(source) &&
      !toolLines.some((line) => line.includes(source)),
  )
}
