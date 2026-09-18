import { readdir } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { format } from "date-fns"
import { execa } from "execa"
import type { ExecutionContext } from "./context.js"
import type { Feedback, ModelSelection, PhaseOutput } from "./feedback.js"
import {
  type Context,
  capabilityTag,
  contextChange,
  contextText,
  elapsedText,
  modelText,
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
import type { Terminal } from "./terminal.js"

export type OutputOptions = {
  readonly terminal: Terminal
  readonly verbose?: boolean
  readonly now?: () => number
  readonly openFiles?: typeof openRunFiles
}

/** What one command run is called, which phases it runs and where it records. */
export type Run = {
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
  const stem = (
    basename(target.plan) === "plan.md"
      ? basename(dirname(target.plan))
      : basename(target.plan, ".md")
  ).replace(/-widen$/, "")
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
): string {
  const tag = capabilityTag(entry, selections[entry.assistant])
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
      const match =
        /^(\d{2,})-(?:claim\.md|[ao][btu][lmhx]-(?:round\.(?:md|log)|(?:audit|vet|rebut|brief|ruling|watch)\.md|brief\.log))$/.exec(
          suffix,
        )
      return match === null ? 0 : Number(match[1])
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
  /**
   * The round's place in a chain, for the title only. Disk claims own filenames.
   */
  round?: number,
): Promise<
  Run & {
    readonly nameStart: string
    readonly verdict: string
    readonly paths: { readonly markdown: string }
  }
> {
  const phases = roundPhases(
    setup.auditor ?? "codex",
    setup.override ?? noOverride,
  )
  const entry = (phase: Phase): RunEntry => ({ phase, ...phases[phase] })
  for (const phase of Object.keys(phases) as Phase[]) {
    if (phase !== "glance" && (phase !== "verdict" || "plan" in setup))
      fileTag(entry(phase), selections)
  }
  const target = await targetDescription(setup)
  const nameStart = await nextNameStart(setup, target.label)
  const base = join(
    setup.cwd,
    `${nameStart}-${fileTag(entry("audit"), selections)}-round`,
  )
  return {
    nameStart,
    verdict: join(
      setup.cwd,
      `${nameStart}-${fileTag(entry("verdict"), selections)}-watch.md`,
    ),
    name: "Audit round",
    title: `Audit round of ${target.title}${round === undefined ? "" : ` (round ${round})`}`,
    phases: [
      entry("audit"),
      entry("vet"),
      entry("rebut"),
      entry("fix"),
      entry("brief"),
      ...("plan" in setup ? [entry("verdict")] : []),
    ],
    paths: {
      claim: join(setup.cwd, `${nameStart}-claim.md`),
      log: `${base}.log`,
      markdown: `${base}.md`,
    },
    selections,
    started,
  }
}

/** A later writer reuses the transcript's target and number, replacing its tag and kind. */
export function transcriptNameStart(transcript: string): string {
  const match = /^(.+-\d{2,})-[ao][btu][lmhx]-round\.md$/.exec(
    basename(transcript),
  )
  if (match === null)
    throw new Error(
      "Name a round's *-round.md transcript at the Repo Edu or plan checkout root.",
    )
  return match[1]
}

/** A brief on its own logs beside the transcript it retells and keeps no transcript of its own. */
export function briefRun(
  transcript: string,
  started: number,
  selections: Record<Assistant, ModelSelection>,
): Run {
  const phase = {
    phase: "brief",
    ...roundPhases("codex", noOverride).brief,
  } as const
  return {
    name: "Brief",
    title: `Brief of ${basename(transcript)}`,
    phases: [phase],
    selections,
    paths: {
      claim: null,
      log: join(
        dirname(transcript),
        `${transcriptNameStart(transcript)}-${fileTag(phase, selections)}-brief.log`,
      ),
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
        previousToolTokens: number | null
        statusTokens: number | null
      }
    | undefined
  private timer: ReturnType<typeof setInterval> | undefined

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
    this.active = {
      input,
      started: this.clock.mark(),
      context: null,
      previousToolTokens: null,
      // A fresh session starts empty, so its first stamp reports the startup context.
      statusTokens: input.sessionId === null ? 0 : null,
    }
    const mode = input.sessionId === null ? "fresh" : "resumed"
    this.say(
      `\n${"─".repeat(72)}\n[${input.phase}] starting ${input.assistant} (${mode})`,
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
            active.context,
            changeSince(active.context, active.previousToolTokens),
          )
          this.files.log(line)
          if (this.options.verbose) terminal?.write(line.slice(0, 160))
          active.previousToolTokens = active.context?.tokens ?? null
        }
        break
      }
    }
    terminal?.status(this.stamp())
  }

  private finishPhase(result: PhaseResult): void {
    this.say(this.report())
    const detail =
      result.status === "failed"
        ? `: ${result.reason}`
        : "file" in result
          ? `: ${result.file}`
          : ""
    this.say(`[${this.active?.input.phase}] ${result.status}${detail}`)
  }

  prepareHandover = async (session: InteractiveSession): Promise<void> => {
    this.release()
    this.clock.active()
    this.active = {
      input: { phase: "fix", assistant: session.assistant },
      started: this.clock.mark(),
      context: null,
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
