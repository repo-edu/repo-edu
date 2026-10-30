import { readFile, rm, writeFile } from "node:fs/promises"
import type { ModelReleases, ModelSelection } from "./feedback.js"
import { errorMessage } from "./feedback.js"
import { phaseSelection } from "./output-format.js"
import {
  type Assistant,
  type AuditorOption,
  type AuditorSeat,
  auditPair,
  noOverride,
  parseAuditor,
  roundPhases,
} from "./phase.js"
import type { RoundSettings } from "./settings.js"

/** One selection as written, so rewriting the queue keeps the user's spelling. */
export type AuditorEntry = AuditorSeat & { readonly text: string }

export type AuditorSetting = ModelSelection & { readonly assistant: Assistant }

/** The pair's members as they resolve, so a refusal names what the user can pick. */
function pairText(assistant: Assistant, settings: RoundSettings): string {
  return ([0, 1] as const)
    .map((slot) => {
      const { model, effort } = roundPhases(
        assistant,
        noOverride,
        settings,
        slot,
      ).audit.model
      return `${model.value} at ${effort.value}`
    })
    .join(" and ")
}

/**
 * A partial tag inherits from settings, which is ambiguous when those settings
 * hold two members. Names select the defaults and full tags replace both fields.
 */
export function validateAuditorEntries(
  entries: readonly AuditorEntry[],
  settings: RoundSettings,
): void {
  entries.forEach((entry, index) => {
    const pair = auditPair(entry.assistant, settings)
    if (
      pair !== null &&
      typeof entry.override === "object" &&
      "strength" in entry.override &&
      (entry.override.strength === null || entry.override.effort === null)
    )
      throw new Error(
        `Auditor entry ${index + 1} (${entry.text}) is a partial tag, but ${entry.assistant}'s audit selection is the pair ${pairText(entry.assistant, settings)}. Use ${entry.assistant} or a full tag with both tier and effort.`,
      )
  })
}

/** The exact auditor setting an entry asks the current runner invocation to use. */
export function auditorSetting(
  entry: AuditorSeat,
  releases: Record<Assistant, ModelReleases>,
  settings: RoundSettings,
): AuditorSetting {
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
  settings?: RoundSettings,
): AuditorEntry[] {
  const entries = text
    .split(/[\s,]+/)
    .filter((entry) => entry.length > 0)
    .map((entry, index) => {
      const seat = parseAuditor(entry, option)
      if (seat === null)
        throw new Error(
          `Auditor entry ${index + 1} (${entry}): expected claude, codex or a capability tag, such as o, at or otx.`,
        )
      return { ...seat, text: entry }
    })
  if (settings !== undefined) validateAuditorEntries(entries, settings)
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
async function readQueue(
  path: string,
  settings: RoundSettings,
): Promise<AuditorEntry[]> {
  let text: string
  try {
    text = await readFile(path, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
  // The queue holds the rest of an `--auditor` list.
  try {
    return parseAuditors(text, "--auditor", settings)
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
  ended: AuditorSetting | null,
  releases: Record<Assistant, ModelReleases>,
  settings: RoundSettings,
): Promise<{
  readonly next: AuditorEntry | null
  readonly rest: readonly AuditorEntry[]
  readonly skipped: number
}> {
  const queued = await readQueue(path, settings)
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
