import * as command from "../command.js"
import * as output from "../output.js"
import * as format from "../output-format.js"
import * as phase from "../phase.js"
import * as round from "../round.js"
import { settingsSchema } from "../settings.js"
import fixture from "./fixtures/settings.json" with { type: "json" }

export * from "../command.js"
export * from "../output.js"
export * from "../output-format.js"
export * from "../phase.js"
export * from "../round.js"
export * from "../round-paths.js"

/** Test inputs stay fixed when an operator edits either settings file. */
export const testSettings = settingsSchema.parse(fixture)

export const runCommand = (...args: Parameters<typeof command.runCommand>) =>
  command.runCommand(args[0], args[1], { settings: testSettings, ...args[2] })

export const roundRun = (
  setup: Parameters<typeof output.roundRun>[0],
  started: number,
  selections: Parameters<typeof output.roundRun>[2],
) => output.roundRun(setup, started, selections, testSettings)

export const closeRun = (
  plan: string,
  roots: Parameters<typeof output.closeRun>[1],
  started: number,
  selections: Parameters<typeof output.closeRun>[3],
) => output.closeRun(plan, roots, started, selections, testSettings)

export const runRound = (
  input: round.RoundInput,
  dependencies: Parameters<typeof round.runRound>[1],
) => round.runRound(input, dependencies, testSettings)

export const runClose = (
  input: round.CloseInput,
  dependencies: Parameters<typeof round.runClose>[1],
) => round.runClose(input, dependencies, testSettings)

/** The assistant's default selection under the test settings, as a phase pins it. */
export const pinned = (assistant: phase.Assistant) =>
  phase.defaultModel(assistant, testSettings)

/** The first coder, which fixes code work that has no ready assignment. */
export const testFixer: phase.RoundFixer = {
  fixer: testSettings.implementation.coders[0],
  fixerSource: "audit-round implementation coders",
}

/** The first configured coder selection, as the test fixer pins it. */
export const pinnedCoder = () =>
  phase.implementationPhase(testFixer.fixer, testFixer.fixerSource).model

export const roundPhases = (
  auditor: phase.Assistant,
  override: phase.AuditorOverride,
  settings = testSettings,
  fixer = phase.roundFixer(
    { roundKind: "implementation", plan: "example.md", scope: "1" },
    null,
    settings,
  ),
) => phase.roundPhases(auditor, override, settings, fixer)

export const modelStrength = (
  assistant: phase.Assistant,
  model: string,
  settings = testSettings,
) => phase.modelStrength(assistant, model, settings)

export const capabilityTag = (
  entry: format.RunEntry,
  configured: Parameters<typeof format.capabilityTag>[1],
) => format.capabilityTag(entry, configured, testSettings)

export const commitStamps = (
  entries: Parameters<typeof format.commitStamps>[0],
  selections: Parameters<typeof format.commitStamps>[1],
) => format.commitStamps(entries, selections, testSettings)
