import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { execa } from "execa"
import { z } from "zod"
import {
  looseForm,
  parseSubject,
  type Repository,
  type Subject,
  stemTopic,
} from "./subject.js"

/**
 * The glance that follows a finished plan round. It answers one question from
 * the commit record and the watch's own history: has the record moved far
 * enough that the trajectory watch would read it differently than last time?
 * The watch is two sessions that read the log and then the code behind it,
 * and most rounds do not move the record that far. The glance is the cheap
 * check that keeps the watch from running on every round. It grades nothing,
 * names no area and writes no file; the watch phase owns the record.
 *
 * The user directed the glance on 2026-09-13. It ran as a Claude session until
 * 2026-09-20, when its rule set moved here: every threshold below is applied
 * without the user in the loop, so it is code rather than judgement.
 */

/** One commit as the log lists it, newest first. */
export type LogCommit = {
  readonly sha: string
  readonly subject: string
  readonly files: readonly string[]
}

const watchRecordSchema = z.object({
  heads: z.record(z.string(), z.string()),
  grade: z.enum(["green", "amber", "red"]),
  horizon: z.number().int().nonnegative(),
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
  /** One or two sentences: what the record held, how far the episode moved and which rule decided. */
  readonly text: string
}

/** The distance at which a green record earns another watch. */
const greenHorizon = 4

function parsed(commit: LogCommit, repository: Repository): Subject | null {
  try {
    return parseSubject(commit.subject, repository)
  } catch {
    // A subject the settled grammar refuses still counts toward the distance
    // when it belongs to the episode; it raises none of the subject rules.
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
 * convention, so the artifact-set test is what admits it. When HEAD carries no
 * stem the episode is the unstemmed history under the key `-`.
 *
 * The distance is the count of episode commits since this repository's
 * recorded head. Implementation-audit fixes, deferral records and clean
 * records count like any other commit: the repeated-fix gate excludes those
 * rounds because their fixes are expected, but the watch reads them for
 * convergence, and an exclusion here could keep the watch asleep through a
 * whole run of audit rounds. The user removed the inherited exclusion on
 * 2026-09-20. A watch is due when any one of these holds:
 *
 * 1. No record exists for this episode in this repository, or the recorded
 *    head is not on HEAD's history. The first round after a watch was never
 *    run always earns one.
 * 2. The recorded grade is red. A conclusive flag is re-read every round until
 *    the user acts on it and the record moves.
 * 3. The distance has reached the recorded horizon: the number the watch named
 *    on amber, or four on green, which says there was no near-term need and
 *    not that the episode is finished.
 * 4. A counted subject's severity sequence carries an uppercase A, whatever
 *    the record says. That is a trajectory event on its own.
 * 5. Three or more counted subjects carry `growth-high`, or two or more carry
 *    a `!` with an uppercase B. Either is a run the watch should read while it
 *    is forming.
 *
 * The thresholds are deliberately loose: the cost of a watch that finds
 * nothing is one round's worth of reading, and the cost of a missed one is
 * the drift the user asked to stop meeting by intuition.
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

  const record = watchRecordSchema.safeParse(records?.[key])
  const head = record.success ? record.data.heads[repository] : undefined
  if (!record.success || head === undefined)
    return {
      due: true,
      text: `${episode} has no watch record for ${repository}; the first watch is due (rule 1).`,
    }
  const at = log.findIndex((commit) => sameHead(commit.sha, head))
  if (at === -1)
    return {
      due: true,
      text: `${episode} recorded ${record.data.grade} at ${head}, which is not on HEAD's history; a watch is due (rule 1).`,
    }
  const since = log.slice(0, at)
  const counted = since.filter(member)
  const outside = since.length - counted.length
  const subjects = counted
    .map((commit) => parsed(commit, repository))
    .filter((subject) => subject !== null)
  const { grade, horizon } = record.data
  const held = `${episode} recorded ${grade} at ${head} with horizon ${horizon}; ${counted.length} episode commits since, ${outside} outside the episode.`
  const due = (reason: string) => ({ due: true, text: `${held} ${reason}` })
  if (grade === "red")
    return due("A red record is re-read every round (rule 2).")
  if (
    subjects.some(
      (subject) =>
        subject.severity !== null &&
        subject.severity !== "clean" &&
        subject.severity.upper.some((run) => run.tier === "a"),
    )
  )
    return due("A subject carries an uppercase A (rule 4).")
  const growthHigh = subjects.filter(
    (subject) =>
      subject.growth?.direction === "growth" && subject.growth.level === "high",
  ).length
  const ordinaryB = subjects.filter(
    (subject) =>
      subject.severity !== null &&
      subject.severity !== "clean" &&
      subject.severity.ordinary &&
      subject.severity.upper.some((run) => run.tier === "b"),
  ).length
  if (growthHigh >= 3)
    return due(`${growthHigh} subjects carry growth-high (rule 5).`)
  if (ordinaryB >= 2)
    return due(`${ordinaryB} subjects carry ! with an uppercase B (rule 5).`)
  const limit = grade === "green" ? greenHorizon : horizon
  if (counted.length >= limit)
    return due(`The distance has reached the horizon of ${limit} (rule 3).`)
  return {
    due: false,
    text: `${held} No rule holds, so the watch is not due.`,
  }
}

/** The repository's history from HEAD, newest first, with the files each commit touched. */
export async function readLog(cwd: string): Promise<LogCommit[]> {
  const { stdout } = await execa(
    "git",
    ["log", "--format=%x1e%h%x1f%s", "--name-only"],
    { cwd, maxBuffer: 256 * 1024 * 1024 },
  )
  return stdout
    .split("\x1e")
    .filter((entry) => entry.trim().length > 0)
    .map((entry) => {
      const [header, ...rest] = entry.split("\n")
      const [sha, subject] = header.split("\x1f")
      return {
        sha,
        subject: subject ?? "",
        files: rest.filter((line) => line.length > 0),
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
