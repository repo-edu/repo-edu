import { readFile, rm, writeFile } from "node:fs/promises"
import type { ModelReleases } from "./feedback.js"
import { errorMessage } from "./feedback.js"
import { phaseSelection } from "./output-format.js"
import {
  type Assistant,
  type AuditorOption,
  type AuditorSeat,
  parseAuditor,
  roundPhases,
} from "./phase.js"
import type { Auditor, RoundSettings } from "./settings.js"

/** One selection as written, so rewriting the queue keeps the user's spelling. */
export type AuditorEntry = AuditorSeat & { readonly text: string }

/**
 * One entry grammar for positional lists, command options and queue files.
 * Entries may be separated by commas or whitespace.
 */
export function splitEntries(text: string): string[] {
  return text.split(/[\s,]+/).filter((entry) => entry.length > 0)
}

/**
 * The exact auditor an entry asks the current runner invocation to use. The
 * model reads as the release its CLI resolved at startup, the name the round
 * data stores, so a queue's ending signal and the judge's series pool compare
 * with recorded rounds by that one name.
 */
export function auditorSetting(
  entry: AuditorSeat,
  releases: Record<Assistant, ModelReleases>,
  settings: RoundSettings,
): Auditor {
  const audit = roundPhases(entry.assistant, entry.override, settings).audit
  return {
    assistant: entry.assistant,
    ...phaseSelection(audit.model, releases[entry.assistant]),
  }
}

/**
 * Names or tags in round order, separated by commas, spaces or line breaks.
 * `--auditor`, `--first` and the queue file share this grammar.
 */
export function parseAuditors(
  text: string,
  option: AuditorOption,
): AuditorEntry[] {
  const entries = splitEntries(text).map((entry, index) => {
    const seat = parseAuditor(entry, option)
    if (seat === null)
      throw new Error(
        `Auditor entry ${index + 1} (${entry}): expected claude, codex or a capability tag, such as o, at or otx.`,
      )
    return { ...seat, text: entry }
  })
  return entries
}

/**
 * The queue file holds the auditors still to run after the current round. The
 * user may edit it at any time; the runner reads it only between rounds.
 */
export async function writeQueue(
  path: string,
  entries: readonly AuditorEntry[],
): Promise<void> {
  await writeFile(path, entries.map((entry) => `${entry.text}\n`).join(""))
}

/** A missing file is an empty queue, so deleting it also ends the sequence. */
async function readQueue(path: string): Promise<AuditorEntry[]> {
  let text: string
  try {
    text = await readFile(path, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
  // The queue holds the rest of an `--auditor` list.
  try {
    return parseAuditors(text, "--auditor")
  } catch (error) {
    throw new Error(`${path}: ${errorMessage(error)}`)
  }
}

/**
 * Take the next round's auditor between rounds. An ending signal first drops
 * entries that resolve to its exact assistant, model and effort. The rest go
 * back to the file for the user to keep editing.
 */
export async function takeNext(
  path: string,
  ended: Auditor | null,
  releases: Record<Assistant, ModelReleases>,
  settings: RoundSettings,
): Promise<{
  readonly next: AuditorEntry | null
  readonly rest: readonly AuditorEntry[]
  readonly skipped: number
}> {
  const queued = await readQueue(path)
  const kept = queued.filter((entry) => {
    if (ended === null) return true
    const setting = auditorSetting(entry, releases, settings)
    return !(
      setting.assistant === ended.assistant &&
      setting.model === ended.model &&
      setting.effort === ended.effort
    )
  })
  const [next = null, ...rest] = kept
  await writeQueue(path, rest)
  return { next, rest, skipped: queued.length - kept.length }
}

export async function removeQueue(path: string): Promise<void> {
  await rm(path, { force: true })
}
