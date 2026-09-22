import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { execa } from "execa"
import { z } from "zod"
import { correctionAreas } from "./findings.js"
import {
  looseForm,
  parseSubject,
  type Repository,
  type Subject,
  stemTopic,
} from "./subject.js"

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

/** One commit as the log lists it, newest first. */
export type LogCommit = {
  readonly sha: string
  readonly subject: string
  readonly body: string
  readonly files: readonly string[]
}

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
}

export type GlanceDecision = {
  readonly due: boolean
  /** The saved grade, correction counts and reason for the decision. */
  readonly text: string
}

/** Fixed correction-commit limits per area. The watch chooses only the grade. */
const correctionLimits = { green: 4, amber: 2 } as const

function parsed(commit: LogCommit, repository: Repository): Subject | null {
  try {
    return parseSubject(commit.subject, repository)
  } catch {
    // An unreadable subject supplies no graded correction evidence.
    return null
  }
}

function topic(commit: LogCommit): string | null {
  const form = looseForm(commit.subject)
  return form === null ? null : stemTopic(form.stem)
}

function sameHead(sha: string, head: string): boolean {
  return sha.startsWith(head) || head.startsWith(sha)
}

/**
 * The rule. `log` lists the repository's history from HEAD, newest first, and
 * `records` is the whole watch record keyed by episode stem, or null when it
 * cannot be read.
 *
 * The episode is derived from HEAD alone, the way the watch does: the most
 * recent stem on HEAD names it, its core artifact set is every file a commit
 * carrying that stem touched, and a commit belongs when its subject carries
 * the stem or it touches that set. Off-plan rework drops the stem by
 * convention, so the artifact-set test is what admits it. When no commit in
 * the history carries a stem, the episode uses the key `-`.
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
  log: readonly LogCommit[],
  records: Readonly<Record<string, unknown>> | null,
  repository: Repository,
): GlanceDecision {
  const stem = log.map(topic).find((name) => name !== null) ?? null
  const key = stem ?? "-"
  const episode = stem === null ? "the unstemmed history" : `episode ${stem}`
  const artifacts = new Set(
    log.filter((commit) => topic(commit) === stem).flatMap((c) => c.files),
  )
  const member = (commit: LogCommit) =>
    stem === null ||
    topic(commit) === stem ||
    commit.files.some((file) => artifacts.has(file))

  const saved = watchRecordSchema.safeParse(records?.[key])
  const record = saved.success ? saved.data : null
  const head = record?.heads[repository]
  const recorded =
    record === null || head === undefined
      ? null
      : {
          grade: record.grade,
          head,
          at: log.findIndex((commit) => sameHead(commit.sha, head)),
        }
  const anchor =
    stem === null
      ? log.length
      : log.findLastIndex((commit) => topic(commit) === stem) + 1
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
  const since = log.slice(0, window.end)
  if (grade === "red")
    return {
      due: true,
      text: `${held} A red record is re-read every round (rule 1).`,
    }

  const counts = new Map<string, number>()
  for (const commit of since.filter(member)) {
    if (commit.files.length === 0) continue
    const subject = parsed(commit, repository)
    if (subject === null) continue
    let areas: ReadonlySet<string>
    try {
      areas = correctionAreas(subject, commit.body, repository)
    } catch (error) {
      throw new Error(
        `Cannot count corrections in ${commit.sha}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
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

/** The repository's history from HEAD, newest first, with the files each commit touched. */
export async function readLog(cwd: string): Promise<LogCommit[]> {
  const { stdout } = await execa(
    "git",
    ["log", "--format=%x1e%h%x1f%s%x1f%b%x1f", "--name-only"],
    { cwd, maxBuffer: 256 * 1024 * 1024 },
  )
  return stdout
    .split("\x1e")
    .filter((entry) => entry.trim().length > 0)
    .map((entry) => {
      const [sha, subject, body, files] = entry.split("\x1f")
      return {
        sha,
        subject: subject ?? "",
        body: body ?? "",
        files: (files ?? "").split("\n").filter((line) => line.length > 0),
      }
    })
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
  const [log, records] = await Promise.all([
    readLog(input.cwd),
    readWatchRecords(input.cacheRoot),
  ])
  return glanceDecision(log, records, input.repository)
}
