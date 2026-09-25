import { basename, dirname, join } from "node:path"
import { format } from "date-fns"
import type { Feedback, ModelSelection, PhaseOutput } from "./feedback.js"
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
  type RunEntry,
  toolText,
} from "./output-format.js"
import {
  type Assistant,
  noOverride,
  type Phase,
  type PhaseInput,
  type PhaseResult,
  roundPhases,
  transcribed,
} from "./phase.js"
import { recoveryCommand } from "./requests.js"
import type { BriefResult, RoundResult, RoundSetup } from "./round.js"
import {
  type FileKind,
  phaseFilename,
  roundIdentity,
  transcriptNameStart,
} from "./round-paths.js"
import { RunClock, type RunMark } from "./run-clock.js"
import { openRunFiles, type RunFiles, type RunPaths } from "./run-files.js"
import type { RoundSettings } from "./settings.js"
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
  readonly selections: Record<Assistant, ModelSelection>
  readonly paths: RunPaths
  /** The reading that dates the run files; the timers count from it too. */
  readonly started: number
}

/** A tag must be known before any file reserves or records the round. */
function fileTag(
  entry: RunEntry,
  selections: Record<Assistant, ModelSelection>,
  settings: RoundSettings,
): string {
  const tag = capabilityTag(entry, selections[entry.assistant], settings)
  if (tag !== null) return tag
  const advice =
    entry.phase === "audit" || entry.phase === "rebut"
      ? "Supply a full --auditor tag."
      : `Set ${entry.assistant}'s effort in its CLI settings; --auditor does not control this phase.`
  throw new Error(
    `Cannot name ${entry.assistant} ${entry.phase} output: its effort is missing or unsupported. ${advice}`,
  )
}

export async function roundRun(
  setup: RoundSetup,
  started: number,
  selections: Record<Assistant, ModelSelection>,
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
  )
  const entry = (phase: Phase): RunEntry => ({ phase, ...phases[phase] })
  const tag = (phase: Phase): string =>
    fileTag(entry(phase), selections, settings)
  for (const phase of Object.keys(phases) as Phase[]) {
    if (phase !== "brief" || setup.brief !== false) tag(phase)
  }
  const { nameStart, title } = await roundIdentity(setup)
  const path = (kind: FileKind, phase: Phase) =>
    join(setup.cwd, phaseFilename(nameStart, kind, tag(phase)))
  const base = path("round", "audit")
  return {
    nameStart,
    watch: `${path("watch", "watch")}.md`,
    documents: {
      report: `${path("audit", "audit")}.md`,
      vet: `${path("vet", "vet")}.md`,
      rebut: `${path("rebut", "rebut")}.md`,
      brief: setup.brief === false ? null : `${path("brief", "brief")}.md`,
      ruling: `${path("ruling", "fix")}.md`,
    },
    name: "Audit round",
    title: `Audit round of ${title}${round === undefined ? "" : ` (round ${round})`}`,
    phases: [
      entry("audit"),
      entry("vet"),
      entry("rebut"),
      entry("fix"),
      ...(setup.brief === false ? [] : [entry("brief")]),
      ...("plan" in setup ? [entry("watch"), entry("watch-edit")] : []),
    ],
    paths: {
      claim: join(setup.cwd, `${nameStart}-claim.md`),
      log: `${base}.log`,
      markdown: `${base}.md`,
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
  selections: Record<Assistant, ModelSelection>,
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

export class RoundOutput<R extends Run = Run> {
  readonly paths: R["paths"]
  readonly phase: PhaseOutput
  private readonly files: RunFiles
  private readonly clock: RunClock
  private active:
    | {
        input: Pick<PhaseInput, "phase" | "assistant">
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
   * Started phases in order, with each CLI's applied selection. Before a
   * phase reports, its launch selection lets that child identify itself.
   * Feedback replaces that selection without changing another phase's record.
   */
  private readonly ran = new Map<Phase, ModelSelection>()

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

  models(selections: Record<Assistant, ModelSelection>): void {
    const { phases } = this.run
    const lead = phases[0]?.assistant
    // Phases are grouped by assistant so one assistant's model reads as one block.
    const rows = phases
      .toSorted(
        (first, second) =>
          Number(first.assistant !== lead) - Number(second.assistant !== lead),
      )
      // A named field reports itself; the rest reports the CLI's own selection.
      .map(({ phase, assistant, model }) => ({
        phase,
        assistant,
        ...phaseText(model, selections[assistant], assistant),
      }))
    const phaseWidth = Math.max(...rows.map(({ phase }) => phase.length))
    const assistantWidth = Math.max(
      ...rows.map(({ assistant }) => assistant.length),
    )
    const modelWidth = Math.max(...rows.map(({ model }) => model.length))
    const text = rows
      .map(
        ({ phase, assistant, model, source }) =>
          `${phase.padEnd(phaseWidth)}  ${assistant.padEnd(assistantWidth)}  ${model.padEnd(modelWidth)}  ${source}`,
      )
      .join("\n")
    this.say(text)
    // Fenced, so the column alignment survives markdown rendering.
    this.transcribe(`\`\`\`text\n${text}\n\`\`\`\n`)
  }

  /**
   * What the commit-msg hook stamps into a commit this run's work lands, read
   * when a child starts so it names only the phases that ran by then. A clean
   * round that skipped the vet and the rebuttal stamps neither.
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

  private start(input: PhaseInput, prompt: string): void {
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
    this.ran.set(
      input.phase,
      phaseSelection(input.model, this.run.selections[input.assistant]),
    )
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
        this.ran.set(active.input.phase, feedback.selection)
        this.say(
          `${prefix} ${active.input.assistant} ${modelText(feedback.selection)}`,
        )
        break
      case "context":
        active.context = feedback
        break
      case "text":
        // The saved brief is displayed once after validation, even if its writer echoes it.
        if (active.input.phase === "brief") break
        if (feedback.text.length > 0) {
          this.say(this.report())
          if (transcribed(active.input.phase)) {
            this.transcribe(`${feedback.text}\n`)
          }
          terminal?.write(feedback.text.trimEnd(), "markdown")
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
    this.say(this.report())
    const detail = result.status === "failed" ? `: ${result.reason}` : ""
    this.say(`[${this.active?.input.phase}] ${result.status}${detail}`)
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

  finish(result: RoundResult | BriefResult): void {
    this.release()
    if (result.status === "failed") {
      const resume =
        result.sessionId === null
          ? ""
          : `\nResume: ${recoveryCommand({ ...result, sessionId: result.sessionId })}`
      this.say(
        `${this.report()}\n[${result.phase}] failed: ${result.reason}\nSession: ${result.sessionId ?? "unavailable"}${resume}`,
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
}

function changeSince(context: Context | null, baseline: number | null): string {
  return context === null ? "--" : contextChange(context, baseline)
}
