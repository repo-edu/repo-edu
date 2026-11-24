import { basename, join } from "node:path"
import type { ModelReleases } from "./feedback.js"
import type { Run } from "./output.js"
import { capabilityTag, phaseSelection } from "./output-format.js"
import { type Assistant, implementationPhase, type PhaseRun } from "./phase.js"
import { stepOutputName, stepRulingFilename } from "./round-paths.js"
import type { Coder, RoundSettings } from "./settings.js"
import { planStem } from "./target.js"

export type ImplementationIdentity = {
  readonly phaseRun: PhaseRun
  readonly release: string
  readonly effort: Coder["effort"]
  readonly tag: string
  readonly record: string
}

/** Resolve the ready assignment once for worker launches, records and markers. */
export function implementationIdentity(
  coder: Coder,
  releases: Record<Assistant, ModelReleases>,
  settings: RoundSettings,
): ImplementationIdentity {
  const phaseRun = implementationPhase(coder)
  const selected = phaseSelection(phaseRun.model, releases[coder.assistant])
  const entry = { phase: "implement" as const, ...phaseRun }
  return {
    phaseRun,
    release: selected.model,
    effort: selected.effort,
    tag: capabilityTag(entry, releases[coder.assistant], settings),
    record: `${selected.model} ${selected.effort}`,
  }
}

/**
 * A recovery appends to the same step log and transcript. Their names omit
 * the coder's tag because settings may reclassify its release between turns.
 */
export function implementationRun(
  plan: string,
  roundRoot: string,
  step: number,
  started: number,
  releases: Record<Assistant, ModelReleases>,
  settings: RoundSettings,
  identity: ImplementationIdentity,
  resumedSession: string | null,
): Run & { readonly ruling: string } {
  const stem = planStem(plan)
  const base = join(roundRoot, stepOutputName(stem, step))
  return {
    ruling: join(roundRoot, stepRulingFilename(stem, step, identity.tag)),
    name: "Implementation",
    target: stem,
    title: `Implementation of ${basename(plan)}, step ${step}${resumedSession === null ? "" : `, resuming session ${resumedSession}`}`,
    phases: [{ phase: "implement", ...identity.phaseRun }],
    settings,
    releases,
    paths: {
      claim: null,
      log: `${base}.log`,
      markdown: `${base}.md`,
      mode: resumedSession === null ? "w" : "a",
    },
    previousModels: [],
    started,
  }
}
