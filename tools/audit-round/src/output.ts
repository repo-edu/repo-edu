import { readdir } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { format } from "date-fns"
import { execa } from "execa"
import type { ExecutionContext } from "./context.js"
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
  type InteractiveSession,
  noOverride,
  type Phase,
  type PhaseInput,
  type PhaseResult,
  roundPhases,
  transcribed,
} from "./phase.js"
import { recoveryCommand } from "./requests.js"
import type { BriefResult, RoundResult, RoundSetup } from "./round.js"
import { RunClock, type RunMark } from "./run-clock.js"
import { openRunFiles, type RunFiles, type RunPaths } from "./run-files.js"
import type { RoundSettings } from "./settings.js"
import { planStem } from "./target.js"
import type { Terminal } from "./terminal.js"

const phaseOrder = {
  round: 0,
  audit: 1,
  vet: 2,
  rebut: 3,
  fix: 4,
  brief: 5,
  ruling: 6,
  glance: 7,
  watch: 8,
} as const

type FileKind = Exclude<keyof typeof phaseOrder, "fix" | "glance">

function phaseFilename(nameStart: string, kind: FileKind, tag: string): string {
  return `${nameStart}-${phaseOrder[kind]}-${kind}.${tag}`
}

function readPhaseFilename(
  name: string,
): { nameStart: string; kind: FileKind; extension: string } | null {
  const match =
    /^(.+-\d{2,})-(\d)-(round|audit|vet|rebut|brief|ruling|watch)\.([ao][btu][lmhx])\.(md|log)$/.exec(
      name,
    )
  if (match === null) return null
  const kind = match[3] as FileKind
  if (
    Number(match[2]) !== phaseOrder[kind] ||
    (match[5] === "log" && kind !== "round" && kind !== "brief")
  )
    return null
  return { nameStart: match[1], kind, extension: match[5] }
}

export type RoundDocuments = {
  readonly report: string
  readonly vet: string
  readonly rebut: string
  readonly brief: string
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

async function targetDescription(target: RoundSetup): Promise<{
  label: string
  title: string
}> {
  if ("commits" in target) {
    const first = target.commits[0]
    const head = first.includes("HEAD")
      ? (
          await execa("git", ["rev-parse", "--short", "HEAD"], {
            cwd: target.cwd,
          })
        ).stdout
      : ""
    // Keep list filenames bounded; the title and phase arguments carry every reference.
    return {
      label: `${first.replaceAll("HEAD", head)}${target.commits.length === 1 ? "" : `-plus-${target.commits.length - 1}`}`,
      title: `commits ${target.commits.join(" ")}`,
    }
  }
  const stem = planStem(target.plan)
  if (target.roundKind === "planning")
    return { label: stem, title: `plan ${target.plan}` }
  const scope =
    target.scope === undefined
      ? "all"
      : `${target.scope.includes("-") ? "steps" : "step"}-${target.scope}`
  return {
    label: `${stem}-${scope}`,
    title: `implementation ${target.plan} ${target.scope ?? "all"}`,
  }
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

/** Read every retained kind at both roots; opening the run claims this candidate. */
async function nextNameStart(
  context: ExecutionContext,
  target: string,
): Promise<string> {
  const roots = await Promise.all(
    [context.repoEduRoot, context.planRoot].map((root) =>
      readdir(root, { withFileTypes: true }),
    ),
  )
  const numbers = roots
    .flat()
    .filter((file) => file.isFile())
    .map((file) => file.name)
    .filter((name) => name.startsWith(`${target}-`))
    .map((name) => {
      const suffix = name.slice(target.length + 1)
      const claim = /^(\d{2,})-claim\.md$/.exec(suffix)
      if (claim !== null) return Number(claim[1])
      const parsed = readPhaseFilename(name)
      const number = parsed?.nameStart.slice(target.length + 1)
      return number !== undefined && /^\d{2,}$/.test(number)
        ? Number(number)
        : 0
    })
  const next = Math.max(0, ...numbers) + 1
  if (!Number.isSafeInteger(next))
    throw new Error(`Round number exhausted for ${target}`)
  return `${target}-${String(next).padStart(2, "0")}`
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
    readonly paths: { readonly markdown: string }
  }
> {
  const phases = roundPhases(
    setup.auditor ?? settings.defaultAuditor,
    setup.override ?? noOverride,
    settings,
  )
  const entry = (phase: Phase): RunEntry => ({ phase, ...phases[phase] })
  for (const phase of Object.keys(phases) as Phase[]) {
    if (!phase.startsWith("watch") || "plan" in setup)
      fileTag(entry(phase), selections, settings)
  }
  const target = await targetDescription(setup)
  const nameStart = await nextNameStart(setup, target.label)
  const path = (kind: FileKind, phase: Phase) =>
    join(
      setup.cwd,
      phaseFilename(
        nameStart,
        kind,
        fileTag(entry(phase), selections, settings),
      ),
    )
  const base = path("round", "audit")
  return {
    nameStart,
    watch: `${path("watch", "watch")}.md`,
    documents: {
      report: `${path("audit", "audit")}.md`,
      vet: `${path("vet", "vet")}.md`,
      rebut: `${path("rebut", "rebut")}.md`,
      brief: `${path("brief", "brief")}.md`,
      ruling: `${path("ruling", "rule")}.md`,
    },
    name: "Audit round",
    title: `Audit round of ${target.title}${round === undefined ? "" : ` (round ${round})`}`,
    phases: [
      entry("audit"),
      entry("vet"),
      entry("rebut"),
      entry("fix"),
      entry("brief"),
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

/** A later writer reuses the transcript's target and number, replacing its tag and kind. */
export function transcriptNameStart(transcript: string): string {
  const parsed = readPhaseFilename(basename(transcript))
  if (parsed?.kind !== "round" || parsed.extension !== "md")
    throw new Error(
      "Name a round's *-0-round.<tag>.md transcript at the Repo Edu or plan checkout root.",
    )
  return parsed.nameStart
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

  private say(
    text: string,
    terminal: Terminal | null = this.options.terminal,
  ): void {
    this.files.log(text)
    terminal?.write(text)
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

  /** Recording keeps the same formatting and measurements while Codex owns the terminal. */
  interactive = async (feedback: Feedback): Promise<void> => {
    this.observe(feedback, null)
  }

  private observe(
    feedback: Feedback,
    terminal: Terminal | null = this.options.terminal,
  ): void {
    const active = this.active
    if (active === undefined)
      throw new Error("Phase feedback arrived without an active output")
    // A user message is the user's own; every other feedback is a sign of life.
    if (feedback.type === "user-text") this.clock.awaited()
    else this.clock.active()
    const prefix = `[${active.input.phase}]`
    switch (feedback.type) {
      case "session":
        this.say(
          `${prefix} ${active.input.assistant} session ${feedback.sessionId}`,
          terminal,
        )
        break
      case "model":
        this.ran.set(active.input.phase, feedback.selection)
        this.say(
          `${prefix} ${active.input.assistant} ${modelText(feedback.selection)}`,
          terminal,
        )
        break
      case "context":
        active.context = feedback
        break
      case "text":
      case "user-text":
        if (feedback.text.length > 0) {
          this.say(this.report(), terminal)
          if (transcribed(active.input.phase)) {
            if (terminal === null)
              this.transcribe(
                `### ${feedback.type === "user-text" ? "User" : "Assistant"}\n`,
              )
            this.transcribe(`${feedback.text}\n`)
          }
          terminal?.write(feedback.text.trimEnd())
        }
        break
      case "diagnostic":
        this.say(`${prefix} ${feedback.text}`, terminal)
        break
      case "tool": {
        if (feedback.invocation !== null) {
          const line = toolText(
            feedback.invocation,
            elapsedText(this.clock.elapsed(active.previousToolMark)),
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

  prepareHandover = async (session: InteractiveSession): Promise<void> => {
    this.release()
    this.clock.active()
    const started = this.clock.mark()
    this.active = {
      input: { phase: "fix", assistant: session.assistant },
      started,
      context: null,
      previousToolMark: started,
      previousToolTokens: null,
      statusTokens: null,
    }
    this.say(
      `Opening ${session.assistant} session ${session.sessionId} for the ruling.\nRecording continues in the round files until this interactive session exits.\nResume: ${recoveryCommand(session)}`,
    )
    this.transcribe(`## fix (${session.assistant}, interactive)\n`)
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
      // Leaving the interactive CLI is the user's own action, so the span back
      // to the assistant's last sign of life was theirs too.
      if (result.status === "handed-over") {
        this.clock.awaited()
        this.files.log(this.report())
      }
      this.say(
        result.status === "finished"
          ? `${this.run.name} finished.`
          : "Interactive session ended; workflow completion is not inferred.",
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
