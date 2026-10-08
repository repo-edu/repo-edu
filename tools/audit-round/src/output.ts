import { basename, dirname, join } from "node:path"
import { format } from "date-fns"
import type { CliModels, Feedback, PhaseOutput } from "./feedback.js"
import {
  type Context,
  capabilityTag,
  commitStamps,
  contextChange,
  contextText,
  elapsedText,
  modelText,
  phaseSelection,
  phaseText,
  phaseTokenText,
  type RanPhase,
  type RunEntry,
  toolText,
} from "./output-format.js"
import {
  type Assistant,
  type AssistantTurnInput,
  noOverride,
  type Phase,
  type PhaseResult,
  type PhaseRun,
  roundPhases,
  transcribed,
} from "./phase.js"
import { withoutPhaseResult } from "./phase-result.js"
import { recoveryCommand } from "./requests.js"
import type {
  BriefResult,
  CloseResult,
  RoundResult,
  RoundSetup,
} from "./round.js"
import {
  type ModelTokenUsage,
  type RoundData,
  roundDataIdentity,
  writeRoundData,
} from "./round-data.js"
import {
  type FileKind,
  phaseFilename,
  roundIdentity,
  transcriptNameStart,
} from "./round-paths.js"
import { RunClock, type RunMark } from "./run-clock.js"
import { openRunFiles, type RunFiles, type RunPaths } from "./run-files.js"
import type { RoundSettings } from "./settings.js"
import { planStem } from "./target.js"
import type { Terminal } from "./terminal.js"

export type RoundDocuments = {
  readonly report: string
  readonly vet: string
  readonly rebut: string
  readonly brief: string | null
  readonly ruling: string
}

/** The rule that sets a phase start or a glance off from what came before. */
const separator = "─".repeat(72)

export type OutputOptions = {
  readonly terminal: Terminal
  readonly verbose?: boolean
  readonly now?: () => number
  readonly openFiles?: typeof openRunFiles
}

/** What one command run is called, which phases it runs and where it records. */
export type Run = {
  readonly settings: RoundSettings
  /** The run's kind, as the terminal names it when it ends. */
  readonly name: string
  readonly title: string
  readonly phases: readonly RunEntry[]
  readonly selections: Record<Assistant, CliModels>
  readonly paths: RunPaths
  /** Present only for an automated round, whose retained JSON is written at the end. */
  readonly data?: {
    readonly path: string
    readonly target: string
    readonly round: number
    readonly settings: RoundData["settings"]
    readonly auditor: RoundData["auditor"]
  }
  /** The reading that dates the run files; the timers count from it too. */
  readonly started: number
}

function resolvedRun(run: PhaseRun, selections: Record<Assistant, CliModels>) {
  return phaseSelection(run.model, selections[run.assistant])
}

/** Settings that split trials, resolved once with the same phase owner as execution. */
function roundSettingsData(
  selections: Record<Assistant, CliModels>,
  settings: RoundSettings,
): RoundData["settings"] {
  const audit = (
    assistant: Assistant,
  ): RoundData["settings"]["audit"][Assistant] => {
    const first = resolvedRun(
      roundPhases(assistant, noOverride, settings, 0).audit,
      selections,
    )
    if (!Array.isArray(settings.phases.audit[assistant])) return first
    return [
      first,
      resolvedRun(
        roundPhases(assistant, noOverride, settings, 1).audit,
        selections,
      ),
    ]
  }
  const vet = (assistant: Assistant) =>
    resolvedRun(
      roundPhases(
        assistant === "claude" ? "codex" : "claude",
        noOverride,
        settings,
      ).vet,
      selections,
    )
  const fix = roundPhases("codex", noOverride, settings).fix
  return {
    audit: { claude: audit("claude"), codex: audit("codex") },
    vet: { claude: vet("claude"), codex: vet("codex") },
    fix: { assistant: fix.assistant, ...resolvedRun(fix, selections) },
  }
}

/** A tag must be known before any file reserves or records the round. */
function fileTag(
  entry: RunEntry,
  selections: Record<Assistant, CliModels>,
  settings: RoundSettings,
): string {
  const tag = capabilityTag(entry, selections[entry.assistant], settings)
  if (tag !== null) return tag
  const advice =
    entry.phase === "audit" || entry.phase === "rebut"
      ? "Supply a full --auditor or --first tag."
      : `Set ${entry.assistant}'s effort in its CLI settings; --auditor does not control this phase.`
  throw new Error(
    `Cannot name ${entry.assistant} ${entry.phase} output: its effort is missing or unsupported. ${advice}`,
  )
}

export async function roundRun(
  setup: RoundSetup,
  started: number,
  selections: Record<Assistant, CliModels>,
  settings: RoundSettings,
  /**
   * The round's place in a chain, for the title only. Disk claims own filenames.
   */
  round?: number,
): Promise<
  Run & {
    readonly nameStart: string
    readonly watch: string
    readonly documents: RoundDocuments
    readonly paths: { readonly claim: string; readonly markdown: string }
  }
> {
  const phases = roundPhases(
    setup.auditor ?? settings.defaultAuditor,
    setup.override ?? noOverride,
    settings,
    setup.auditSlot,
  )
  const entry = (phase: Phase): RunEntry => ({ phase, ...phases[phase] })
  const tag = (phase: Phase): string =>
    fileTag(entry(phase), selections, settings)
  // The close runs alone, so a round never needs its tag.
  for (const phase of Object.keys(phases) as Phase[]) {
    if (phase !== "close" && (phase !== "brief" || setup.brief === true))
      tag(phase)
  }
  const { nameStart, title } = await roundIdentity(setup)
  const identity = roundDataIdentity(nameStart)
  const path = (kind: FileKind, phase: Phase) =>
    join(setup.planRoot, phaseFilename(nameStart, kind, tag(phase)))
  const base = path("round", "audit")
  const audit = entry("audit")
  return {
    nameStart,
    watch: `${path("watch", "watch")}.md`,
    documents: {
      report: `${path("audit", "audit")}.md`,
      vet: `${path("vet", "vet")}.md`,
      rebut: `${path("rebut", "rebut")}.md`,
      brief: setup.brief === true ? `${path("brief", "brief")}.md` : null,
      ruling: `${path("ruling", "fix")}.md`,
    },
    name: "Audit round",
    title: `${title}${round === undefined ? "" : ` (round ${round})`}`,
    phases: [
      entry("audit"),
      entry("vet"),
      entry("rebut"),
      entry("fix"),
      ...(setup.brief === true ? [entry("brief")] : []),
      ...("plan" in setup ? [entry("watch")] : []),
    ],
    paths: {
      claim: join(setup.planRoot, `${nameStart}-0-claim.md`),
      log: `${base}.log`,
      markdown: `${base}.md`,
    },
    data: {
      path: `${base}.json`,
      ...identity,
      settings: roundSettingsData(selections, settings),
      auditor: {
        assistant: audit.assistant,
        ...resolvedRun(audit, selections),
        chosenBy:
          setup.override === undefined || setup.override === noOverride
            ? "settings"
            : "command-line",
      },
    },
    selections,
    settings,
    started,
  }
}

/** A brief on its own logs beside the transcript it retells and keeps no transcript of its own. */
export function briefRun(
  transcript: string,
  started: number,
  selections: Record<Assistant, CliModels>,
  settings: RoundSettings,
): Run & { readonly brief: string } {
  const phase = {
    phase: "brief",
    ...roundPhases("codex", noOverride, settings).brief,
  } as const
  const base = join(
    dirname(transcript),
    phaseFilename(
      transcriptNameStart(transcript),
      "brief",
      fileTag(phase, selections, settings),
    ),
  )
  return {
    brief: `${base}.md`,
    name: "Brief",
    title: `Brief of ${basename(transcript)}`,
    phases: [phase],
    settings,
    selections,
    paths: {
      claim: null,
      log: `${base}.log`,
      markdown: null,
    },
    started,
  }
}

/**
 * A close logs at the plan root under the plan's stem and keeps no transcript.
 * Its session cannot tell its own capability, so the run hands it the tag and
 * model record its commits carry.
 */
export function closeRun(
  plan: string,
  planRoot: string,
  started: number,
  selections: Record<Assistant, CliModels>,
  settings: RoundSettings,
): Run & { readonly tag: string; readonly record: string } {
  const phase = {
    phase: "close",
    ...roundPhases(settings.defaultAuditor, noOverride, settings).close,
  } as const
  const tag = fileTag(phase, selections, settings)
  const { model, effort } = phaseSelection(
    phase.model,
    selections[phase.assistant],
  )
  return {
    tag,
    record: `${model} ${effort}`,
    name: "Close",
    title: `Close of plan ${basename(plan)}`,
    phases: [phase],
    settings,
    selections,
    paths: {
      claim: null,
      log: join(planRoot, `${planStem(plan)}-close.${tag}.log`),
      markdown: null,
    },
    started,
  }
}

export class RoundOutput<R extends Run = Run> {
  readonly paths: R["paths"]
  readonly phase: PhaseOutput
  private readonly files: RunFiles
  private readonly clock: RunClock
  private active:
    | {
        input: Pick<AssistantTurnInput, "phase" | "assistant">
        started: RunMark
        context: Context | null
        /** Where the next tool line's step time counts from: the previous tool line, else the phase start. */
        previousToolMark: RunMark
        previousToolTokens: number | null
        statusTokens: number | null
      }
    | undefined
  private timer: ReturnType<typeof setInterval> | undefined
  /**
   * Started phases in order, with each CLI's applied selection and the
   * assistant time the phase took. Before a phase reports, its launch
   * selection lets that child identify itself. Feedback replaces that
   * selection without changing another phase's record. A resumed phase adds
   * each finished invocation's time to what it already took.
   */
  private readonly ran = new Map<Phase, RanPhase>()

  constructor(
    private readonly run: R,
    private readonly options: OutputOptions,
  ) {
    this.clock = new RunClock(options.now ?? Date.now, run.started)
    this.paths = run.paths
    this.files = (options.openFiles ?? openRunFiles)(this.paths)
    this.phase = {
      start: async (input, prompt) => this.start(input, prompt),
      observe: async (feedback) => this.observe(feedback),
      finish: async (result) => this.finishPhase(result),
      release: () => this.release(),
    }
    try {
      const started = `Started ${format(new Date(run.started), "yyyy-MM-dd'T'HH:mm:ss.SSSxxx")}`
      const texts =
        this.paths.markdown === null ? "" : `\nTexts: ${this.paths.markdown}`
      this.transcribe(`# ${run.title}\n\n${started}\n`)
      this.models(run.selections)
      this.say(`${run.title}\n${started}\nLog: ${this.paths.log}${texts}`)
    } catch (error) {
      this.files.close()
      throw error
    }
  }

  message = async (text: string): Promise<void> => {
    this.say(text)
  }

  /** Runner bookkeeping belongs in both records, without inventing an AI phase. */
  cleanCompletion(text: string): void {
    this.say(`[complete] ${text}`)
    this.transcribe(`## Clean completion\n\n${text}\n`)
  }
  /** A message that opens a new section of the run, set off the way a phase start is. */
  section = async (text: string): Promise<void> => {
    this.say(`\n${separator}\n${text}`)
  }
  warning = async (text: string): Promise<void> => {
    this.say(`Warning: ${text}`)
  }

  models(selections: Record<Assistant, CliModels>): void {
    const { phases } = this.run
    const lead = phases[0]?.assistant
    // Phases are grouped by assistant so one assistant's model reads as one block.
    const rows = phases
      .toSorted(
        (first, second) =>
          Number(first.assistant !== lead) - Number(second.assistant !== lead),
      )
      // A named field reports itself; the rest reports the CLI default.
      .map(({ phase, assistant, model }) => ({
        phase,
        assistant,
        ...phaseText(model, selections[assistant]),
      }))
    const width = (column: (row: (typeof rows)[number]) => string) =>
      Math.max(...rows.map((row) => column(row).length))
    const phaseWidth = width(({ phase }) => phase)
    const assistantWidth = width(({ assistant }) => assistant)
    const modelWidth = width(({ model }) => model)
    const effortWidth = width(({ effort }) => effort)
    const text = rows
      .map(
        ({ phase, assistant, model, effort, source }) =>
          `${phase.padEnd(phaseWidth)}  ${assistant.padEnd(assistantWidth)}  ${model.padEnd(modelWidth)} ${effort.padEnd(effortWidth)}  ${source}`,
      )
      .join("\n")
    this.say(text)
    // Fenced, so the column alignment survives markdown rendering.
    this.transcribe(`\`\`\`text\n${text}\n\`\`\`\n`)
  }

  /**
   * What the commit-msg hook stamps into a commit this run's work lands, read
   * when a child starts so it names only the phases that ran by then and times
   * only those that finished. A clean round that skipped the vet and the
   * rebuttal stamps neither.
   */
  commitStamps = (): ReturnType<typeof commitStamps> =>
    commitStamps(this.run.phases, this.ran, this.run.settings)

  private say(text: string): void {
    this.files.log(text)
    this.options.terminal.write(text)
  }

  private transcribe(text: string): void {
    this.files.markdown?.(text)
  }

  private stamp(): string {
    if (this.active === undefined) return ""
    const { input, started, context, statusTokens } = this.active
    const measurement = contextText(context, changeSince(context, statusTokens))
    return `\n[${input.phase}] ${elapsedText(this.clock.elapsed(started))}  total ${elapsedText(this.clock.elapsed(this.clock.run))}${measurement ? `  ${measurement}` : ""}`
  }

  /** Written stamps chain: each reports the context added since the previous one. */
  private report(): string {
    const stamp = this.stamp()
    if (this.active?.context != null)
      this.active.statusTokens = this.active.context.tokens
    return stamp
  }

  private start(input: AssistantTurnInput, prompt: string): void {
    this.release()
    this.clock.active()
    const started = this.clock.mark()
    this.active = {
      input,
      started,
      context: null,
      previousToolMark: started,
      previousToolTokens: null,
      // A fresh session starts empty, so its first stamp reports the startup context.
      statusTokens: input.sessionId === null ? 0 : null,
    }
    this.ran.set(input.phase, {
      selection: phaseSelection(
        input.model,
        this.run.selections[input.assistant],
      ),
      spent: this.ran.get(input.phase)?.spent ?? null,
      tokens: this.ran.get(input.phase)?.tokens ?? [],
    })
    const mode = input.sessionId === null ? "fresh" : "resumed"
    this.say(
      `\n${separator}\n[${input.phase}] starting ${input.assistant} (${mode})`,
    )
    this.files.log(`[${input.phase}] prompt:\n${prompt}\n`)
    if (transcribed(input.phase))
      this.transcribe(`## ${input.phase} (${input.assistant}, ${mode})\n`)
    this.options.terminal.status(this.stamp())
    this.timer = setInterval(
      () => this.options.terminal.status(this.stamp()),
      1000,
    )
    this.timer.unref()
  }

  private observe(feedback: Feedback): void {
    const terminal = this.options.terminal
    const active = this.active
    if (active === undefined)
      throw new Error("Phase feedback arrived without an active output")
    this.clock.active()
    const prefix = `[${active.input.phase}]`
    switch (feedback.type) {
      case "session":
        this.say(
          `${prefix} ${active.input.assistant} session ${feedback.sessionId}`,
        )
        break
      case "model":
        this.ran.set(active.input.phase, {
          selection: feedback.selection,
          spent: this.ran.get(active.input.phase)?.spent ?? null,
          tokens: this.ran.get(active.input.phase)?.tokens ?? [],
        })
        this.say(
          `${prefix} ${active.input.assistant} ${modelText(feedback.selection)}`,
        )
        break
      case "context":
        active.context = feedback
        break
      case "tokens": {
        const run = this.ran.get(active.input.phase)
        if (run === undefined)
          throw new Error("Token usage arrived before its phase started")
        const additions: readonly ModelTokenUsage[] =
          feedback.update.kind === "total"
            ? [{ model: run.selection.model, ...feedback.update.tokens }]
            : feedback.update.models
        const totals =
          feedback.update.kind === "total"
            ? additions
            : addTokenUsage(run.tokens, additions)
        this.ran.set(active.input.phase, { ...run, tokens: totals })
        break
      }
      case "text":
        // The saved brief is displayed once after validation, even if its writer echoes it.
        if (active.input.phase === "brief") break
        if (feedback.text.length > 0) {
          this.say(this.report())
          if (transcribed(active.input.phase)) {
            this.transcribe(`${feedback.text}\n`)
          }
          const text = withoutPhaseResult(feedback.text)
          if (text.length > 0) terminal?.write(text, "markdown")
        }
        break
      case "diagnostic":
        this.say(`${prefix} ${feedback.text}`)
        break
      case "tool": {
        if (feedback.invocation !== null) {
          const line = toolText(
            feedback.invocation,
            elapsedText(this.clock.elapsed(active.previousToolMark)),
            elapsedText(this.clock.elapsed(this.clock.run)),
            active.context,
            changeSince(active.context, active.previousToolTokens),
          )
          this.files.log(line)
          if (this.options.verbose) terminal?.write(line.slice(0, 160))
          active.previousToolMark = this.clock.mark()
          active.previousToolTokens = active.context?.tokens ?? null
        }
        break
      }
    }
    terminal?.status(this.stamp())
  }

  private finishPhase(result: PhaseResult): void {
    const active = this.active
    const run = active && this.ran.get(active.input.phase)
    if (active === undefined || run === undefined)
      throw new Error("A phase finished without starting")
    this.say(`${this.report()}${tokenSuffix(run.tokens)}`)
    const { phase } = active.input
    this.ran.set(phase, {
      selection: run.selection,
      spent: (run.spent ?? 0) + this.clock.elapsed(active.started),
      tokens: run.tokens,
    })
    const detail = result.status === "failed" ? `: ${result.reason}` : ""
    this.say(`[${phase}] ${result.status}${detail}`)
    this.active = undefined
  }

  showBrief(text: string): void {
    this.release()
    this.files.log(text)
    this.options.terminal.write(text, "markdown")
  }

  beginRuling(document: string, text: string): void {
    this.release()
    this.say(`\n${separator}\nYour ruling is needed.\nDocument: ${document}`)
    this.options.terminal.write(text, "markdown")
    this.say(
      "Write your reply below. A blank line sends it; Ctrl-C stops without sending.",
    )
    this.clock.active()
  }

  endRuling(reply: string | null): void {
    this.clock.awaited()
    if (reply === null) return
    this.files.log(`[ruling] User reply:\n${reply}`)
    this.transcribe(`## User ruling\n\n${reply}\n`)
  }

  finish(result: RoundResult | BriefResult | CloseResult): void {
    const unsettledReport =
      this.active === undefined
        ? ""
        : `${this.report()}${tokenSuffix(this.ran.get(this.active.input.phase)?.tokens ?? [])}`
    this.finishUnsettledInvocation()
    if (this.run.data !== undefined) {
      if (!("commits" in result))
        throw new Error("A round ended without its landed commit account")
      writeRoundData(this.run.data.path, {
        target: this.run.data.target,
        round: this.run.data.round,
        started: new Date(this.run.started).toISOString(),
        settings: this.run.data.settings,
        auditor: this.run.data.auditor,
        phases: [...this.ran].flatMap(([phase, ran]) => {
          if (phase === "close" || ran.spent === null) return []
          const entry = this.run.phases.find(
            (candidate) => candidate.phase === phase,
          )
          if (entry === undefined)
            throw new Error(`Run data has no ${phase} phase owner`)
          return [
            {
              phase,
              assistant: entry.assistant,
              model: ran.selection.model,
              effort: ran.selection.effort,
              milliseconds: Math.round(ran.spent),
              tokens: [...ran.tokens],
            },
          ]
        }),
        commits: [...result.commits],
      })
    }
    this.release()
    if (result.status === "failed") {
      const resume =
        result.sessionId === null
          ? ""
          : `\nResume: ${recoveryCommand({ ...result, sessionId: result.sessionId })}`
      this.say(
        `${unsettledReport}\n[${result.phase}] failed: ${result.reason}\nSession: ${result.sessionId ?? "unavailable"}${resume}`,
      )
    } else {
      this.say(
        result.status === "finished"
          ? `${this.run.name} finished.`
          : `Stopped without a ruling. The round files are retained.\nResume: ${recoveryCommand(result.session)}`,
      )
    }
  }

  release(): void {
    clearInterval(this.timer)
    this.timer = undefined
    this.options.terminal.clear()
  }

  close(): void {
    try {
      this.release()
    } finally {
      this.files.close()
    }
  }

  /** A rejected invocation still contributes the time and tokens spent before it failed. */
  private finishUnsettledInvocation(): void {
    const active = this.active
    if (active === undefined) return
    const run = this.ran.get(active.input.phase)
    if (run === undefined) return
    this.ran.set(active.input.phase, {
      selection: run.selection,
      spent: (run.spent ?? 0) + this.clock.elapsed(active.started),
      tokens: run.tokens,
    })
    this.active = undefined
  }
}

function changeSince(context: Context | null, baseline: number | null): string {
  return context === null ? "--" : contextChange(context, baseline)
}

function tokenSuffix(tokens: readonly ModelTokenUsage[]): string {
  const text = phaseTokenText(tokens)
  return text.length === 0 ? "" : `  tokens  ${text}`
}

function addTokenUsage(
  current: readonly ModelTokenUsage[],
  additions: readonly ModelTokenUsage[],
): readonly ModelTokenUsage[] {
  const totals = new Map(current.map((usage) => [usage.model, usage]))
  for (const usage of additions) {
    const prior = totals.get(usage.model)
    totals.set(
      usage.model,
      prior === undefined
        ? usage
        : {
            model: usage.model,
            input: prior.input + usage.input,
            cached: prior.cached + usage.cached,
            output: prior.output + usage.output,
          },
    )
  }
  return [...totals.values()]
}
