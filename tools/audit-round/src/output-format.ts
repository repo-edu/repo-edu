import { split } from "shellwords"
import type { Feedback, ModelSelection } from "./feedback.js"
import {
  type Assistant,
  assistantLetters,
  effortLetter,
  modelStrength,
  type Phase,
  type PinnedModel,
  strengthLetters,
  transcribed,
} from "./phase.js"
import type { RoundSettings } from "./settings.js"

export type Context = Extract<Feedback, { type: "context" }>

export function modelText(selection: ModelSelection): string {
  const effort = selection.effort === "xhigh" ? "extra high" : selection.effort
  return `${selection.model} ${effort ?? "effort unavailable"}`
}

/**
 * What one phase runs on, and what named it. A field the phase did not name
 * follows the assistant's own configuration, so a phase that took only its
 * model from the command line names both sources, model first.
 */
export function phaseText(
  { model, effort }: PinnedModel,
  configured: ModelSelection,
  assistant: Assistant,
): { readonly model: string; readonly source: string } {
  const own = `${assistant} settings`
  const modelSource = model?.source ?? own
  const effortSource = effort?.source ?? own
  return {
    model: modelText({
      model: model?.value ?? configured.model,
      effort: effort?.value ?? configured.effort,
    }),
    source:
      modelSource === effortSource
        ? modelSource
        : `${modelSource}/${effortSource}`,
  }
}

/** What a phase requests before its own CLI reports the applied selection. */
export function phaseSelection(
  { model, effort }: PinnedModel,
  configured: ModelSelection,
): ModelSelection {
  return {
    model: model?.value ?? configured.model,
    effort: effort?.value ?? configured.effort,
  }
}

/** One phase of a run, as the commit body and the settings header list it. */
export type RunEntry = {
  readonly phase: Phase
  readonly assistant: Assistant
  readonly model: PinnedModel
}

/**
 * The commit body's leading lines: the phases that carried out the round,
 * grouped by what they ran on. Phases keep round order within a line and lines
 * keep the order of their first phase, so one reading runs top to bottom.
 */
export function commitPhaseLines(
  selections: ReadonlyMap<Phase, ModelSelection>,
): string {
  const lines = new Map<string, Phase[]>()
  for (const [phase, { model, effort }] of selections) {
    if (!transcribed(phase)) continue
    const ran = effort === null ? model : `${model} ${effort}`
    lines.set(ran, [...(lines.get(ran) ?? []), phase])
  }
  return [...lines]
    .map(([ran, phases]) => `${phases.join(", ")}: ${ran}`)
    .join("\n")
}

/**
 * A phase's capability tag: the assistant's letter, the strength's letter and
 * the effort's letter, each from its own alphabet so a character decodes
 * without its position. An unreported effort is the one case with nothing to
 * write, and the commit body carries the exact model either way.
 */
export function capabilityTag(
  entry: RunEntry,
  configured: ModelSelection,
  settings: RoundSettings,
): string | null {
  return selectionTag(
    entry.assistant,
    phaseSelection(entry.model, configured),
    settings,
  )
}

function selectionTag(
  assistant: Assistant,
  { model, effort }: ModelSelection,
  settings: RoundSettings,
): string | null {
  const letter = effort === null ? null : effortLetter(effort)
  if (letter === null) return null
  const strength = modelStrength(assistant, model, settings)
  return `${assistantLetters[assistant]}${strength === null ? "u" : strengthLetters[strength]}${letter}`
}

/**
 * What a round stamps into a commit its fix lands: the body's phase lines and
 * the auditor's subject mark. A run with no audit phase stamps neither.
 */
export function commitStamps(
  entries: readonly RunEntry[],
  selections: ReadonlyMap<Phase, ModelSelection>,
  settings: RoundSettings,
): { readonly phases: string; readonly auditor: string | null } | undefined {
  const audit = entries.find(({ phase }) => phase === "audit")
  const selection = selections.get("audit")
  if (audit === undefined || selection === undefined) return undefined
  return {
    phases: commitPhaseLines(selections),
    auditor: selectionTag(audit.assistant, selection, settings),
  }
}

export function tokenText(tokens: number, decimals = 0): string {
  const magnitude = Math.round(Math.abs(tokens) / (decimals === 0 ? 1000 : 100))
  const number = (magnitude / 10 ** decimals).toFixed(decimals)
  return `${tokens < 0 && magnitude > 0 ? "-" : ""}${number}k`
}

export function contextChange(
  context: Context,
  previous: number | null,
): string {
  if (previous === null) return "--"
  const change = tokenText(context.tokens - previous, 1)
  return change === "0.0k" ? "" : change
}

export function contextText(context: Context | null, change: string): string {
  if (context === null) return ""
  const percent =
    context.window === null
      ? ""
      : `  ${Math.round((context.tokens / context.window) * 100)}%`
  return `context  ${change}  ${tokenText(context.tokens)}${percent}`
}

export function elapsedText(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
}

/** Decode only the recognised outer invocation. Shellwords never executes text. */
export function commandText(command: string): string {
  if (command.startsWith("/bin/zsh ") || command.startsWith("zsh ")) {
    try {
      const words = split(command)
      if (words.length === 3 && (words[1] === "-lc" || words[1] === "-c"))
        command = words[2]
    } catch {
      // Unrecognised display text remains intact in the record.
    }
  }
  return command.replace(/[\r\n\t]/g, " ")
}

/**
 * One logged tool invocation. It opens with the step's own time, the assistant
 * time since the previous tool line, followed by the run's total assistant time.
 */
export function toolText(
  invocation: string,
  elapsed: string,
  runningTotal: string,
  context: Context | null,
  change: string,
): string {
  const total = context === null ? "--" : tokenText(context.tokens)
  const percent =
    context?.window == null
      ? "--"
      : `${Math.round((context.tokens / context.window) * 100)}%`
  return `  ${elapsed.padStart(5)}  ${runningTotal.padStart(5)}  ${change.padStart(6)}  ${total.padStart(4)}  ${percent.padStart(4)}  ${invocation.replace(/[\r\n\t]/g, " ")}`
}

export function toolInputText(input: Record<string, unknown>): string {
  for (const key of [
    "command",
    "file_path",
    "path",
    "pattern",
    "skill",
    "description",
  ]) {
    const value = input[key]
    if (typeof value === "string")
      return key === "command" ? commandText(value) : value
  }
  return JSON.stringify(input)
}
