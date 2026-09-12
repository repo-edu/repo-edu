import { basename, join } from "node:path"
import { format } from "date-fns"
import type { Feedback, ModelSelection, PhaseOutput } from "./feedback.js"
import {
  type Context,
  contextChange,
  contextText,
  elapsedText,
  modelText,
  toolText,
} from "./output-format.js"
import {
  type Assistant,
  type InteractiveSession,
  type PhaseInput,
  type PhaseResult,
  phaseAssistants,
  transcribed,
} from "./phase.js"
import { recoveryCommand } from "./requests.js"
import type { BriefResult, RoundResult, RoundSetup } from "./round.js"
import { openRunFiles, type RunFiles, type RunPaths } from "./run-files.js"
import type { Terminal } from "./terminal.js"

export type OutputOptions = {
  readonly terminal: Terminal
  readonly verbose?: boolean
  readonly now?: () => number
  readonly openFiles?: typeof openRunFiles
}

/** What one command run is called, which roles it seats and where it records. */
export type Run = {
  /** The run's kind, as the terminal names it when it ends. */
  readonly name: string
  readonly title: string
  readonly roles: readonly (readonly [role: string, assistant: Assistant])[]
  readonly paths: RunPaths
  /** The reading that dates the run files; the timers count from it too. */
  readonly started: number
}

function fileTimestamp(started: number): string {
  return format(new Date(started), "yyyy-MM-dd'T'HH-mm-ss")
}

export function roundRun(
  setup: RoundSetup,
  started: number,
): Run & { readonly paths: { readonly markdown: string } } {
  const scope =
    setup.scope === undefined
      ? "all"
      : `${setup.scope.includes("-") ? "steps" : "step"}-${setup.scope}`
  const base = join(
    setup.repoRoot,
    `ROUND-TS-${basename(setup.plan, ".md")}-${scope}-${setup.auditor ?? "codex"}-${fileTimestamp(started)}`,
  )
  const assistants = phaseAssistants(setup.auditor ?? "codex")
  return {
    name: "Audit round",
    title: `Audit round of ${setup.plan} ${setup.scope ?? "all"}`,
    roles: [
      ["auditor", assistants.audit],
      ["vetter", assistants.vet],
      ["rebutter", assistants.rebut],
      ["fixer", assistants.fix],
      ["briefer", assistants.brief],
    ],
    paths: { log: `${base}.log`, markdown: `${base}.md` },
    started,
  }
}

/** A brief on its own logs beside the transcript it retells and keeps no transcript of its own. */
export function briefRun(transcript: string, started: number): Run {
  return {
    name: "Brief",
    title: `Brief of ${basename(transcript)}`,
    roles: [["briefer", phaseAssistants("codex").brief]],
    paths: {
      log: `${transcript.replace(/\.md$/, "")}-brief-${fileTimestamp(started)}.log`,
      markdown: null,
    },
    started,
  }
}

export class RoundOutput<R extends Run = Run> {
  readonly paths: R["paths"]
  readonly phase: PhaseOutput
  private readonly files: RunFiles
  private readonly now: () => number
  private readonly started: number
  private active:
    | {
        input: Pick<PhaseInput, "phase" | "assistant">
        started: number
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
    this.now = options.now ?? Date.now
    this.started = run.started
    this.paths = run.paths
    this.files = (options.openFiles ?? openRunFiles)(this.paths)
    this.phase = {
      start: async (input, prompt) => this.start(input, prompt),
      observe: async (feedback) => this.observe(feedback),
      finish: async (result) => this.finishPhase(result),
      release: () => this.release(),
    }
    try {
      const implementation = `TypeScript runner; started ${format(new Date(run.started), "yyyy-MM-dd'T'HH:mm:ss.SSSxxx")}`
      const texts =
        this.paths.markdown === null ? "" : `\nTexts: ${this.paths.markdown}`
      this.say(
        `${run.title}\n${implementation}\nLog: ${this.paths.log}${texts}`,
      )
      this.transcribe(`# ${run.title}\n\n${implementation}\n`)
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
    const { roles } = this.run
    const lead = roles[0]?.[1]
    // Roles are grouped by assistant so one assistant's model reads as one block.
    const rows = roles
      .toSorted(
        ([, first], [, second]) =>
          Number(first !== lead) - Number(second !== lead),
      )
      .map(([role, assistant]) => ({
        role,
        assistant,
        model: modelText(selections[assistant]),
      }))
    const roleWidth = Math.max(...rows.map(({ role }) => role.length))
    const assistantWidth = Math.max(
      ...rows.map(({ assistant }) => assistant.length),
    )
    const text = rows
      .map(
        ({ role, assistant, model }) =>
          `${role.padEnd(roleWidth)}  ${assistant.padEnd(assistantWidth)}  ${model}`,
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
    const now = this.now()
    return `\n[${input.phase}] ${elapsedText(now - started)}  total ${elapsedText(now - this.started)}${measurement ? `  ${measurement}` : ""}`
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
    this.active = {
      input,
      started: this.now(),
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
    this.active = {
      input: { phase: "fix", assistant: session.assistant },
      started: this.now(),
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
      if (result.status === "handed-over") this.files.log(this.report())
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
