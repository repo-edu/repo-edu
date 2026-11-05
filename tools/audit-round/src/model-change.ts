import { readFile } from "node:fs/promises"
import { relative } from "node:path"
import type { ModelSelection } from "./feedback.js"
import type { Assistant, Phase } from "./phase.js"
import {
  parseRoundDataFile,
  type RoundData,
  roundDataFiles,
} from "./round-data.js"

/** What one assistant was launched on and what it then reported running. */
export type ModelReference = {
  readonly assistant: Assistant
  readonly launched: ModelSelection
  readonly reported: ModelSelection
}

type DatedModelReference = ModelReference & { readonly started: string }

function selectionText(selection: ModelSelection): string {
  return `${selection.model} ${selection.effort ?? "effort unavailable"}`
}

function sameSelection(a: ModelSelection, b: ModelSelection): boolean {
  return a.model === b.model && a.effort === b.effort
}

/**
 * Keep the newest report for each assistant and launched selection, whatever
 * phase ran it. A phase recorded without its launched selection is no
 * reference.
 */
export function previousRoundModels(
  rounds: readonly RoundData[],
): readonly ModelReference[] {
  const references: DatedModelReference[] = []
  for (const round of rounds) {
    for (const phase of round.phases) {
      const launched = phase.launched
      if (launched === undefined) continue
      const at = references.findIndex(
        (candidate) =>
          candidate.assistant === phase.assistant &&
          sameSelection(candidate.launched, launched),
      )
      const reference = {
        assistant: phase.assistant,
        launched,
        reported: { model: phase.model, effort: phase.effort },
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
          return parseRoundDataFile(file, await readFile(file, "utf8")).rounds
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

/**
 * Report a launched selection whose tool now runs a different model or effort
 * than the newest earlier run on that same selection reported. The settings
 * header already shows a changed launched selection, so that alone is no
 * notice.
 */
export function modelChangeNotice(
  references: readonly ModelReference[],
  phase: Phase,
  assistant: Assistant,
  launched: ModelSelection,
  reported: ModelSelection,
): string | null {
  const previous = references.find(
    (reference) =>
      reference.assistant === assistant &&
      sameSelection(reference.launched, launched),
  )?.reported
  if (previous === undefined || sameSelection(previous, reported)) return null
  return `Model change: ${phase} reported ${selectionText(reported)}; the newest earlier ${assistant} run launched on ${selectionText(launched)} reported ${selectionText(previous)}.`
}
