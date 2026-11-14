import { split } from "shellwords"
import type { ModelReleases, ModelSelection } from "./feedback.js"
import {
  type Assistant,
  type Effort,
  efforts,
  type Phase,
  type PinnedModel,
  recorded,
  type SessionContext,
  selectionTag,
} from "./phase.js"
import type { ModelTokenUsage } from "./round-data.js"
import type { RoundSettings } from "./settings.js"

export type Context = SessionContext

function effortText(effort: string | null): string {
  return effort === "xhigh" ? "extra high" : (effort ?? "effort unavailable")
}

export function modelText(selection: ModelSelection): string {
  return `${selection.model} ${effortText(selection.effort)}`
}

/**
 * What one phase runs on, and what named it. A phase whose fields came from
 * different places names both sources, model first.
 */
export function phaseText(
  pinned: PinnedModel,
  releases: ModelReleases,
): {
  readonly model: string
  readonly effort: string
  readonly source: string
} {
  const { model, effort } = phaseSelection(pinned, releases)
  const modelSource = pinned.model.source
  const effortSource = pinned.effort.source
  return {
    model,
    effort: effortText(effort),
    source:
      modelSource === effortSource
        ? modelSource
        : `${modelSource}/${effortSource}`,
  }
}

/** The selection a phase's settings named, before the CLI resolved any alias. */
export function pinnedSelection({
  model,
  effort,
}: PinnedModel): ModelSelection {
  return { model: model.value, effort: effort.value }
}

/**
 * What a phase requests before its own CLI reports the applied selection. A
 * named model reads as the release its CLI resolved it to at startup.
 */
export function phaseSelection(
  { model, effort }: PinnedModel,
  releases: ModelReleases,
): { readonly model: string; readonly effort: Effort } {
  return {
    model: releases.get(model.value) ?? model.value,
    effort: effort.value,
  }
}

/**
 * One phase of a run, as the commit body and the settings header list it. A
 * vet names its tag, because a panel runs one vet per tag.
 */
export type RunEntry = {
  readonly phase: Phase
  readonly assistant: Assistant
  readonly model: PinnedModel
  readonly tag?: string
}

/**
 * The key of one phase's record in a run: the phase, or for a vet the phase
 * and its tag, which also opens each line the output writes for it.
 */
export function slotKey(phase: Phase, tag?: string): string {
  return tag === undefined ? phase : `${phase} ${tag}`
}

/** One started phase: what it ran on and the assistant time it took. */
export type RanPhase = {
  readonly phase: Phase
  /** A vet's tag; other phases have none. */
  readonly tag?: string
  /** What the settings named for the phase; the round data keeps it. */
  readonly launched: ModelSelection
  readonly selection: ModelSelection
  /** The finished invocations' total; null until one finishes. */
  readonly spent: number | null
  /** Tokens attributed to this phase, grouped by the model that spent them. */
  readonly tokens: readonly ModelTokenUsage[]
  /** The fullest context observed across every invocation of this phase. */
  readonly peakContext: Context | null
  /** Compaction events observed across every invocation of this phase. */
  readonly compactions: number
}

/**
 * The commit body's leading lines: the phases that carried out the round,
 * grouped by what they ran on. Phases keep round order within a line and lines
 * keep the order of their first phase, so one reading runs top to bottom.
 */
export function commitPhaseLines(ran: Iterable<RanPhase>): string {
  const lines = new Map<string, Phase[]>()
  for (const { phase, selection } of ran) {
    if (!recorded(phase)) continue
    const { model, effort } = selection
    const runsOn = effort === null ? model : `${model} ${effort}`
    lines.set(runsOn, [...(lines.get(runsOn) ?? []), phase])
  }
  return [...lines]
    .map(([runsOn, phases]) => `${phases.join(", ")}: ${runsOn}`)
    .join("\n")
}

/** The phases whose time a round spends whatever it finds, with their prose names. */
const reviewPhases = [
  ["audit", "audit"],
  ["vet", "vet"],
  ["rebut", "rebuttal"],
] as const

/**
 * The line after the phase lines: how long the finished audit, vet and
 * rebuttal took, as `Audit, vet and rebuttal took 7 min.`. They take that time
 * whatever the round finds, so later model comparisons keep the round's cost.
 * The vet's time adds up every vet of the panel, because each vet is a session
 * the round paid for. The fix commits while it runs, so its time is never known.
 */
export function reviewTimeLine(ran: Iterable<RanPhase>): string | null {
  const records = [...ran]
  const finished = reviewPhases.flatMap(([phase, name]) => {
    const spent = records
      .filter((record) => record.phase === phase && record.spent !== null)
      .map((record) => record.spent as number)
    return spent.length === 0
      ? []
      : [{ name, spent: spent.reduce((total, time) => total + time, 0) }]
  })
  if (finished.length === 0) return null
  const names = finished.map(({ name }) => name)
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
  const minutes = Math.round(
    finished.reduce((total, { spent }) => total + spent, 0) / 60_000,
  )
  return `${list[0].toUpperCase()}${list.slice(1)} took ${minutes} min.`
}

/**
 * A phase's capability tag: the assistant's letter, the strength's letter and
 * the effort's letter, each from its own alphabet so a character decodes
 * without its position. Every phase names one of the four efforts, so the tag
 * is always known before the phase starts.
 */
export function capabilityTag(
  entry: RunEntry,
  releases: ModelReleases,
  settings: RoundSettings,
): string {
  const { model, effort } = phaseSelection(entry.model, releases)
  return selectionTag(entry.assistant, model, effort, settings)
}

/**
 * The tag a reported selection reads as. A CLI may report an effort outside
 * the four the tag can spell, which is the one case with nothing to write;
 * the commit body carries the exact model either way.
 */
function reportedTag(
  assistant: Assistant,
  { model, effort }: ModelSelection,
  settings: RoundSettings,
): string | null {
  return effort !== null && efforts.includes(effort as Effort)
    ? selectionTag(assistant, model, effort as Effort, settings)
    : null
}

/**
 * What a round stamps into a commit its fix lands: the body's phase lines with
 * their time line and the auditor's subject mark. A run with no audit phase
 * stamps neither.
 */
export function commitStamps(
  entries: readonly RunEntry[],
  ran: ReadonlyMap<string, RanPhase>,
  settings: RoundSettings,
): { readonly phases: string; readonly auditor: string | null } | undefined {
  const audit = entries.find(({ phase }) => phase === "audit")
  const run = ran.get(slotKey("audit"))
  if (audit === undefined || run === undefined) return undefined
  const time = reviewTimeLine(ran.values())
  return {
    phases: [
      commitPhaseLines(ran.values()),
      ...(time === null ? [] : [time]),
    ].join("\n"),
    auditor: reportedTag(audit.assistant, run.selection, settings),
  }
}

export function tokenText(tokens: number, decimals = 0): string {
  const magnitude = Math.round(Math.abs(tokens) / (decimals === 0 ? 1000 : 100))
  const number = (magnitude / 10 ** decimals).toFixed(decimals)
  return `${tokens < 0 && magnitude > 0 ? "-" : ""}${number}k`
}

/** A phase's per-model token totals, compact enough to sit beside its time. */
export function phaseTokenText(tokens: readonly ModelTokenUsage[]): string {
  return tokens
    .map(
      (usage) =>
        `${usage.model}: input ${tokenText(usage.input, 1)}, cached ${tokenText(usage.cached, 1)}, output ${tokenText(usage.output, 1)}`,
    )
    .join("; ")
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

/** `mm:ss`, with minutes counting on past the hour, so every reading has one shape. */
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
 * time since the previous tool line, followed by the round's and then the
 * invocation's total assistant time.
 */
export function toolText(
  invocation: string,
  elapsed: string,
  roundTotal: string,
  runTotal: string,
  context: Context | null,
  change: string,
): string {
  const total = context === null ? "--" : tokenText(context.tokens)
  const percent =
    context?.window == null
      ? "--"
      : `${Math.round((context.tokens / context.window) * 100)}%`
  return `  ${elapsed.padStart(5)}  ${roundTotal.padStart(5)}  ${runTotal.padStart(5)}  ${change.padStart(6)}  ${total.padStart(4)}  ${percent.padStart(4)}  ${invocation.replace(/[\r\n\t]/g, " ")}`
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
