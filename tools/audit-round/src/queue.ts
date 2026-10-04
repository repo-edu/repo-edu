import { readFile, rm, writeFile } from "node:fs/promises"
import { errorMessage } from "./feedback.js"
import { type Assistant, type AuditorSeat, parseAuditor } from "./phase.js"

/** One selection as written, so rewriting the queue keeps the user's spelling. */
export type AuditorEntry = AuditorSeat & { readonly text: string }

/**
 * Names or tags in round order, separated by commas, spaces or line breaks.
 * `--auditor` and the queue file share this grammar.
 */
export function parseAuditors(text: string): AuditorEntry[] {
  return text
    .split(/[\s,]+/)
    .filter((entry) => entry.length > 0)
    .map((entry, index) => {
      const seat = parseAuditor(entry)
      if (seat === null)
        throw new Error(
          `Auditor entry ${index + 1} (${entry}): expected claude, codex or a capability tag, such as o, at or otx.`,
        )
      return { ...seat, text: entry }
    })
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
  try {
    return parseAuditors(text)
  } catch (error) {
    throw new Error(`${path}: ${errorMessage(error)}`)
  }
}

/**
 * Take the next round's auditor between rounds. A clean audit by `cleared`
 * first drops that assistant's queued entries, whatever tier or effort they
 * name. The rest go back to the file for the user to keep editing.
 */
export async function takeNext(
  path: string,
  cleared: Assistant | null,
): Promise<{
  readonly next: AuditorEntry | null
  readonly rest: readonly AuditorEntry[]
  readonly skipped: number
}> {
  const queued = await readQueue(path)
  const kept = queued.filter((entry) => entry.assistant !== cleared)
  const [next = null, ...rest] = kept
  await writeQueue(path, rest)
  return { next, rest, skipped: queued.length - kept.length }
}

export async function removeQueue(path: string): Promise<void> {
  await rm(path, { force: true })
}
