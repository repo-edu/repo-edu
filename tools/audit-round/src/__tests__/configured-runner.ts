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
  roundNumber?: number,
) => output.roundRun(setup, started, selections, testSettings, roundNumber)

export const briefRun = (
  transcript: string,
  started: number,
  selections: Parameters<typeof output.briefRun>[2],
) => output.briefRun(transcript, started, selections, testSettings)

export const runRound = (
  input: round.RoundInput,
  dependencies: Parameters<typeof round.runRound>[1],
) => round.runRound(input, dependencies, testSettings)

export const runBrief = (
  input: round.BriefInput,
  dependencies: Parameters<typeof round.runBrief>[1],
) => round.runBrief(input, dependencies, testSettings)

export const roundPhases = (
  auditor: phase.Assistant,
  override: phase.AuditorOverride,
  settings = testSettings,
) => phase.roundPhases(auditor, override, settings)

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
