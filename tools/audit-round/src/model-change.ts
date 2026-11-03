import { readFile } from "node:fs/promises"
import { relative } from "node:path"
import { readModelRecord } from "./commit-msg.js"
import { type LogCommit, readLog } from "./episode-log.js"
import type { ModelSelection } from "./feedback.js"
import { type Assistant, assistantLetters, type Phase } from "./phase.js"
import {
  parseRoundDataFile,
  type RoundData,
  roundDataFiles,
} from "./round-data.js"
import { parseSubject, SubjectError } from "./subject.js"

export type ModelReference = {
  readonly phase: Phase
  readonly assistant: Assistant
  readonly selection: ModelSelection
}

type DatedModelReference = ModelReference & { readonly started: string }

const historicalRoundPhases = [
  "audit",
  "vet",
  "rebut",
  "brief",
  "watch",
  "judge",
] as const satisfies readonly Phase[]

function selectionText(selection: ModelSelection): string {
  return `${selection.model} ${selection.effort ?? "effort unavailable"}`
}

/** Keep the newest recorded selection for each non-fix phase and assistant. */
export function previousRoundModels(
  rounds: readonly RoundData[],
): readonly ModelReference[] {
  const references: DatedModelReference[] = []
  for (const round of rounds) {
    for (const phase of round.phases) {
      if (!historicalRoundPhases.some((candidate) => candidate === phase.phase))
        continue
      const at = references.findIndex(
        (candidate) =>
          candidate.phase === phase.phase &&
          candidate.assistant === phase.assistant,
      )
      const reference = {
        phase: phase.phase,
        assistant: phase.assistant,
        selection: { model: phase.model, effort: phase.effort },
        started: round.started,
      }
      if (at === -1) references.push(reference)
      else if (references[at].started <= round.started)
        references[at] = reference
    }
  }
  return references.map(({ started: _started, ...reference }) => reference)
}

/** Read active and archived plans' checked round data as one model history. */
export async function readPreviousRoundModels(
  planRoot: string,
): Promise<readonly ModelReference[]> {
  const files = await roundDataFiles(planRoot)
  const rounds = (
    await Promise.all(
      files.map(async (file) => {
        try {
          return parseRoundDataFile(file, await readFile(file, "utf8"))
        } catch (error) {
          throw new Error(
            `Invalid round data in ${relative(planRoot, file)}: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          )
        }
      }),
    )
  ).flat()
  return previousRoundModels(rounds)
}

function singleModelSelection(body: string): ModelSelection | null {
  try {
    const record = readModelRecord(body)
    if (record.length !== 1) return null
    const match = /^(\S+) (low|medium|high|xhigh)$/.exec(record[0])
    return match === null ? null : { model: match[1], effort: match[2] }
  } catch (error) {
    if (error instanceof SubjectError) return null
    throw error
  }
}

/** Read the newest earlier close record written by the same assistant. */
export function previousCloseModel(
  commits: readonly LogCommit[],
  assistant: Assistant,
): ModelReference | null {
  for (const commit of commits) {
    try {
      const subject = parseSubject(commit.subject, "plan")
      if (
        subject.form?.role !== "closed" ||
        subject.tag?.vendor !== assistantLetters[assistant]
      )
        continue
    } catch (error) {
      if (error instanceof SubjectError) continue
      throw error
    }
    const selection = singleModelSelection(commit.body)
    if (selection !== null) return { phase: "close", assistant, selection }
  }
  return null
}

export async function readPreviousCloseModel(
  planRoot: string,
  assistant: Assistant,
): Promise<readonly ModelReference[]> {
  const reference = previousCloseModel(await readLog(planRoot), assistant)
  return reference === null ? [] : [reference]
}

/**
 * Report a changed applied selection. Fix and implement compare with this
 * invocation's launch selection; every other phase compares with history.
 */
export function modelChangeNotice(
  references: readonly ModelReference[],
  phase: Phase,
  assistant: Assistant,
  launched: ModelSelection,
  reported: ModelSelection,
): string | null {
  const previous =
    phase === "fix" || phase === "implement"
      ? launched
      : references.find(
          (reference) =>
            reference.phase === phase && reference.assistant === assistant,
        )?.selection
  if (
    previous === undefined ||
    (previous.model === reported.model && previous.effort === reported.effort)
  )
    return null
  return phase === "fix" || phase === "implement"
    ? `Model change: ${phase} reported ${selectionText(reported)}; the runner launched ${assistant} on ${selectionText(previous)}.`
    : `Model change: ${phase} reported ${selectionText(reported)}; the newest earlier ${phase} run by ${assistant} reported ${selectionText(previous)}.`
}
