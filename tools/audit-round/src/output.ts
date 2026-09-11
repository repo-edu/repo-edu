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
} from "./phase.js"
import { recoveryCommand } from "./requests.js"
import type { RoundInput, RoundResult } from "./round.js"
import { openRunFiles, type RunFiles } from "./run-files.js"
import type { Terminal } from "./terminal.js"

export type OutputOptions = {
  readonly terminal: Terminal
  readonly verbose?: boolean
  readonly now?: () => number
  readonly openFiles?: typeof openRunFiles
}

export function roundFilePaths(input: RoundInput, date: Date) {
  const scope =
    input.scope === undefined
      ? "all"
      : `${input.scope.includes("-") ? "steps" : "step"}-${input.scope}`
  const timestamp = format(date, "yyyy-MM-dd'T'HH-mm-ss-SSS")
  const base = join(
    input.repoRoot,
    `ROUND-TS-${basename(input.plan, ".md")}-${scope}-${input.auditor ?? "codex"}-${timestamp}`,
  )
  return { log: `${base}.log`, markdown: `${base}.md` }
}

export class RoundOutput {
  readonly paths: ReturnType<typeof roundFilePaths>
  readonly phase: PhaseOutput
  private readonly files: RunFiles
  private readonly now: () => number
  private active:
    | {
        input: PhaseInput
        started: number
        context: Context | null
        previousToolTokens: number | null
        change: string
      }
    | undefined
  private timer: ReturnType<typeof setInterval> | undefined

  constructor(
    private readonly input: RoundInput,
    private readonly options: OutputOptions,
  ) {
    this.now = options.now ?? Date.now
    const date = new Date(this.now())
    this.paths = roundFilePaths(input, date)
    this.files = (options.openFiles ?? openRunFiles)(this.paths)
    this.phase = {
      start: async (input, prompt) => this.start(input, prompt),
      observe: async (feedback) => this.observe(feedback),
      finish: async (result) => this.finishPhase(result),
      release: () => this.release(),
    }
    try {
      const title = `Audit round of ${input.plan} ${input.scope ?? "all"}`
      const implementation = `TypeScript runner; started ${format(date, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx")}`
      this.say(
        `${title}\n${implementation}\nLog: ${this.paths.log}\nTexts: ${this.paths.markdown}`,
      )
      this.files.markdown(`# ${title}\n\n${implementation}\n`)
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
    const assistants = phaseAssistants(this.input.auditor ?? "codex")
    const roles = [
      ["auditor", assistants.audit],
      ["vetter", assistants.vet],
      ["rebutter", assistants.rebut],
      ["fixer", assistants.fix],
    ] as const
    // Roles are grouped by assistant so one assistant's model reads as one block.
    const rows = roles
      .toSorted(
        ([, first], [, second]) =>
          Number(first !== assistants.audit) -
          Number(second !== assistants.audit),
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
    this.files.markdown(`\`\`\`text\n${text}\n\`\`\`\n`)
  }

  private say(text: string): void {
    this.files.log(text)
    this.options.terminal.write(text)
  }

  private stamp(): string {
    if (this.active === undefined) return ""
    const { input, started, context, change } = this.active
    const measurement = contextText(context, change)
    return `[${input.phase}] ${elapsedText(this.now() - started)}${measurement ? `  ${measurement}` : ""}`
  }

  private start(input: PhaseInput, prompt: string): void {
    this.release()
    this.active = {
      input,
      started: this.now(),
      context: null,
      previousToolTokens: null,
      change: "--",
    }
    const mode = input.sessionId === null ? "fresh" : "resumed"
    this.say(
      `\n${"─".repeat(72)}\n[${input.phase}] starting ${input.assistant} (${mode})`,
    )
    this.files.log(`[${input.phase}] prompt:\n${prompt}\n`)
    this.files.markdown(`## ${input.phase} (${input.assistant}, ${mode})\n`)
    this.options.terminal.status(this.stamp())
    this.timer = setInterval(
      () => this.options.terminal.status(this.stamp()),
      1000,
    )
    this.timer.unref()
  }

  private observe(feedback: Feedback): void {
    const active = this.active
    if (active === undefined)
      throw new Error("Phase feedback arrived without an active output")
    const prefix = `[${active.input.phase}]`
    switch (feedback.type) {
      case "session":
        this.say(
          `${prefix} ${active.input.assistant} session ${feedback.sessionId}`,
        )
        break
      case "model":
        this.say(
          `${prefix} ${active.input.assistant} ${modelText(feedback.selection)}`,
        )
        break
      case "context":
        if (
          feedback.tokens !== active.context?.tokens ||
          feedback.window !== active.context?.window
        ) {
          active.context = feedback
          active.change = contextChange(feedback, active.previousToolTokens)
        }
        break
      case "text":
        if (feedback.text.length > 0) {
          this.say(this.stamp())
          this.files.markdown(`${feedback.text}\n`)
          this.options.terminal.write(`${feedback.text}\n`)
        }
        break
      case "diagnostic":
        this.say(`${prefix} ${feedback.text}`)
        break
      case "tool": {
        if (feedback.invocation !== null) {
          const line = toolText(
            feedback.invocation,
            active.context,
            contextChangeForTool(active),
          )
          this.files.log(line)
          if (this.options.verbose)
            this.options.terminal.write(line.slice(0, 160))
          active.previousToolTokens = active.context?.tokens ?? null
        }
        break
      }
    }
    this.options.terminal.status(this.stamp())
  }

  private finishPhase(result: PhaseResult): void {
    this.say(this.stamp())
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
    this.say(
      `Opening ${session.assistant} session ${session.sessionId} for the ruling.\nResume: ${recoveryCommand(session)}`,
    )
  }

  finish(result: RoundResult): void {
    this.release()
    if (result.status === "failed") {
      const resume =
        result.sessionId === null
          ? ""
          : `\nResume: ${recoveryCommand({ ...result, sessionId: result.sessionId })}`
      this.say(
        `${this.stamp()}\n[${result.phase}] failed: ${result.reason}\nSession: ${result.sessionId ?? "unavailable"}${resume}`,
      )
    } else {
      this.say(
        result.status === "finished"
          ? "Audit round finished."
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

function contextChangeForTool(active: {
  context: Context | null
  previousToolTokens: number | null
}): string {
  return active.context === null
    ? "--"
    : contextChange(active.context, active.previousToolTokens)
}
