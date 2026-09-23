import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { type Episode, readEpisode, sameHead } from "./episode.js"
import type { Repository } from "./subject.js"

/**
 * The glance that follows a finished plan round whose audit had findings.
 * Clean audits never call it. It answers one question from
 * the commit record and the watch's own history: has the record moved far
 * enough that the trajectory watch would read it differently than last time?
 * The watch is two sessions that read the log and then the code behind it,
 * and most rounds do not move the record that far. The glance is the cheap
 * check that keeps the watch from running on every round. It reads recorded
 * areas, grades nothing and writes no file; the watch phase owns the record.
 *
 * The user directed the glance on 2026-09-13. It ran as a Claude session until
 * 2026-09-20, when its rules moved here. The user then replaced severity and
 * growth triggers with repeated A–C corrections in the same area.
 */

const watchRecordSchema = z.strictObject({
  heads: z.record(z.string(), z.string()),
  grade: z.enum(["green", "amber", "red"]),
  written: z.string(),
})

/** One episode's entry in `watch.json`, as the watch workflow writes it. */
export type WatchRecord = z.infer<typeof watchRecordSchema>

export type GlanceInput = {
  readonly cwd: string
  readonly repository: Repository
  readonly cacheRoot: string
  readonly stem?: string
}

export type GlanceDecision = {
  readonly due: boolean
  /** The saved grade, correction counts and reason for the decision. */
  readonly text: string
}

/** Fixed correction-commit limits per area. The watch chooses only the grade. */
const correctionLimits = { green: 4, amber: 2 } as const

/**
 * The rule. The episode owns membership and finding reads, and
 * `records` is the whole watch record keyed by episode stem, or null when it
 * cannot be read.
 *
 * Count file-changing corrections since this repository's recorded head.
 * Each commit counts once per area with an A–C finding, in either case.
 * Repo Edu uses each finding's area; planning uses its section. D-only work,
 * clean records, deferral-only records and planned steps do not count.
 * Severity, reach and growth never trigger a watch on their own.
 * A watch is due when either of these holds:
 *
 * 1. The recorded grade is red. A conclusive flag is re-read every eligible round until
 *    the user acts on it and the record moves.
 * 2. One area reaches four correction commits on green or two on amber.
 *    The watch then judges whether their causes show drift.
 *
 * A record the glance cannot count from reads as green: none for this
 * episode in this repository, an old-format entry or a recorded head that is
 * not on HEAD's history. The count then runs from the episode's anchor, the
 * earliest commit carrying the stem, or over the whole unstemmed history. So
 * an episode's first round never earns a watch by being first; only its
 * corrections can. The user directed this on 2026-09-21.
 */
export function glanceDecision(
  data: Episode,
  records: Readonly<Record<string, unknown>> | null,
): GlanceDecision {
  const { topic: stem, repository } = data
  const key = stem ?? "-"
  const episode = stem === null ? "the unstemmed history" : `episode ${stem}`
  const saved = watchRecordSchema.safeParse(records?.[key])
  const record = saved.success ? saved.data : null
  const head = record?.heads[repository]
  const recorded =
    record === null || head === undefined
      ? null
      : {
          grade: record.grade,
          head,
          at: data.history.findIndex((sha) => sameHead(sha, head)),
        }
  const anchor =
    data.anchor === null ? 0 : data.history.indexOf(data.anchor) + 1
  const window =
    recorded === null
      ? {
          grade: "green" as const,
          end: anchor,
          held: `${episode} has no watch record for ${repository}; it reads green from its anchor.`,
        }
      : recorded.at === -1
        ? {
            grade: "green" as const,
            end: anchor,
            held: `${episode} recorded ${recorded.grade} at ${recorded.head}, which is not on HEAD's history; it reads green from its anchor.`,
          }
        : {
            grade: recorded.grade,
            end: recorded.at,
            held: `${episode} recorded ${recorded.grade} at ${recorded.head}.`,
          }
  const { grade, held } = window
  const since = new Set(data.history.slice(0, window.end))
  if (grade === "red")
    return {
      due: true,
      text: `${held} A red record is re-read every round (rule 1).`,
    }

  const counts = new Map<string, number>()
  for (const commit of data.commits) {
    if (
      !since.has(commit.sha) ||
      commit.files.length === 0 ||
      commit.unreadable !== null
    )
      continue
    const subject = commit.parsed
    if (
      subject === null ||
      subject.severity === null ||
      subject.severity === "clean" ||
      subject.class === "I3"
    )
      continue
    const areas = new Set(
      commit.findings.flatMap((finding) => {
        if (finding.deferred || finding.tier === "d") return []
        return repository === "plan"
          ? [`section:${finding.location.value}`]
          : finding.areas.map((area) => `area:${area}`)
      }),
    )
    for (const area of areas) counts.set(area, (counts.get(area) ?? 0) + 1)
  }
  const limit = correctionLimits[grade]
  const entries = [...counts].sort(([a], [b]) => a.localeCompare(b))
  const summary =
    entries.length === 0
      ? "No A–C correction commits since."
      : `A–C correction commits since: ${entries.map(([area, count]) => `${area} ${count}`).join(", ")}.`
  const due = entries.some(([, count]) => count >= limit)
  return {
    due,
    text: `${held} ${summary} ${due ? `An area reached the ${grade} limit of ${limit} (rule 2).` : `No area reached the ${grade} limit of ${limit}.`}`,
  }
}

/**
 * The watch's own history, or null when it is missing or unreadable. Both
 * mean the watch has never run on this episode here, so neither is an error.
 */
export async function readWatchRecords(
  cacheRoot: string,
): Promise<Readonly<Record<string, unknown>> | null> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(join(cacheRoot, "watch.json"), "utf8"),
    )
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export async function runGlance(input: GlanceInput): Promise<GlanceDecision> {
  const [episode, records] = await Promise.all([
    readEpisode(input.cwd, input.repository, input.stem),
    readWatchRecords(input.cacheRoot),
  ])
  return glanceDecision(episode, records)
}
