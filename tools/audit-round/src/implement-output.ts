import { basename, join } from "node:path"
import type { ModelReleases } from "./feedback.js"
import type { Run } from "./output.js"
import { capabilityTag, phaseSelection } from "./output-format.js"
import { type Assistant, implementationPhase, type PhaseRun } from "./phase.js"
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

/** One worker owns one retained step log and ruling document. */
export function implementationRun(
  plan: string,
  activeRoot: string,
  step: number,
  started: number,
  releases: Record<Assistant, ModelReleases>,
  settings: RoundSettings,
  identity: ImplementationIdentity,
): Run & { readonly ruling: string } {
  const stem = planStem(plan)
  const number = String(step).padStart(2, "0")
  const base = `${stem}-impl-${number}-implement.${identity.tag}`
  return {
    ruling: join(
      activeRoot,
      `${stem}-impl-${number}-implement-ruling.${identity.tag}.md`,
    ),
    name: "Implementation",
    title: `Implementation of ${basename(plan)}, step ${step}`,
    phases: [{ phase: "implement", ...identity.phaseRun }],
    settings,
    releases,
    paths: {
      claim: null,
      log: join(activeRoot, `${base}.log`),
      markdown: null,
    },
    previousModels: [],
    started,
  }
}
