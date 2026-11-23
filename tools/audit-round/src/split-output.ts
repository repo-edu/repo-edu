import { join } from "node:path"
import type { RoundDataRoots } from "./context.js"
import type { ModelReleases } from "./feedback.js"
import { readPreviousRoundModels } from "./model-change.js"
import type { Run } from "./output.js"
import { capabilityTag, phaseSelection } from "./output-format.js"
import { type Assistant, implementationPhase, type PhaseRun } from "./phase.js"
import { splitLabel, splitLogFilename } from "./round-paths.js"
import type { RoundSettings } from "./settings.js"

/**
 * The design selection, resolved once: what the design session runs on, and
 * the capability tag and model record that the design commit and the split
 * commit carry.
 */
export type DesignIdentity = {
  readonly phaseRun: PhaseRun
  readonly tag: string
  readonly record: string
}

export function designIdentity(
  releases: Record<Assistant, ModelReleases>,
  settings: RoundSettings,
): DesignIdentity {
  const phaseRun = implementationPhase(
    settings.splitAudit.designer,
    "audit-round split designer",
  )
  const configured = releases[phaseRun.assistant]
  const { model, effort } = phaseSelection(phaseRun.model, configured)
  return {
    phaseRun,
    tag: capabilityTag({ phase: "design", ...phaseRun }, configured, settings),
    record: `${model} ${effort}`,
  }
}

/**
 * One split call logs in the round folder under the series' label and keeps
 * no transcript. Each call appends, so the log keeps every call on the file in
 * order. The rounds of its series keep their own files.
 */
export async function splitRun(
  source: string,
  roots: RoundDataRoots,
  started: number,
  releases: Record<Assistant, ModelReleases>,
  settings: RoundSettings,
  identity: DesignIdentity,
): Promise<Run> {
  const label = splitLabel(source)
  return {
    name: "Split",
    title: `Split of ${source}`,
    target: label,
    phases: [{ phase: "design", ...identity.phaseRun }],
    settings,
    releases,
    paths: {
      claim: null,
      log: join(roots.roundRoot, splitLogFilename(label)),
      markdown: null,
      reopenLog: true,
    },
    previousModels: await readPreviousRoundModels(roots),
    started,
  }
}
