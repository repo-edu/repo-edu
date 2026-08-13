import type {
  CodingEvent,
  PlanImplementationEvent,
  PlanImplementationFinalResult,
  PlanImplementationRunRequest,
} from "./contracts.js"
import type { PlanImplementationEventObserver } from "./progress-events.js"

type TerminalOutput = {
  write(text: string): unknown
}

function runMode(request: PlanImplementationRunRequest): string {
  switch (request.mode) {
    case "complete":
      return "complete plan"
    case "count":
      return `next ${request.count} ${request.count === 1 ? "step" : "steps"}`
    case "through-step":
      return `through step ${request.throughStep}`
  }
}

function formatClock(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value: number): string => String(value).padStart(2, "0")
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`
}

function formatDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.round(elapsedMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function singleLineCommand(command: string): string {
  const singleLine = command.replaceAll(/\s+/g, " ").trim()
  return singleLine.length <= 200
    ? singleLine
    : `${singleLine.slice(0, 197)}...`
}

const FILE_CHANGE_VERBS = {
  add: "created",
  update: "updated",
  delete: "deleted",
} as const

const FAILED_OUTPUT_LINE_LIMIT = 20

function failedOutputLines(output: string): readonly string[] {
  const lines = output.split("\n").filter((line) => line.trim() !== "")
  return lines.slice(-FAILED_OUTPUT_LINE_LIMIT)
}

export function createTerminalView(
  output: TerminalOutput,
): PlanImplementationEventObserver {
  let totalSteps = 0
  let runStartMs: number | null = null
  let stepStartMs: number | null = null
  let lastLineWasBlank = true
  const commandLabels = new Map<string, string>()

  const writeLine = (line: string): void => {
    output.write(`${line}\n`)
    lastLineWasBlank = line === ""
  }
  const writeBlank = (): void => {
    if (!lastLineWasBlank) writeLine("")
  }
  const elapsedMs = (event: PlanImplementationEvent): number => {
    const eventMs = Date.parse(event.timestamp)
    return runStartMs === null || Number.isNaN(eventMs)
      ? 0
      : eventMs - runStartMs
  }
  const stamp = (event: PlanImplementationEvent): string =>
    `[${formatClock(elapsedMs(event))}]`

  const codingLine = (
    event: PlanImplementationEvent,
    coding: CodingEvent,
  ): void => {
    switch (coding.kind) {
      case "thread-started":
        writeLine(`${stamp(event)} Codex thread ${coding.threadId}.`)
        return
      case "narrative":
        writeBlank()
        writeLine(`${stamp(event)} ${coding.text}`)
        writeBlank()
        return
      case "command":
        if (coding.status === "started") {
          writeLine(`  $ ${singleLineCommand(coding.command)}`)
          return
        }
        if (coding.status === "failed") {
          const exit =
            coding.exitCode === null ? "" : ` (exit ${coding.exitCode})`
          writeLine(
            `  Command failed${exit}: ${singleLineCommand(coding.command)}`,
          )
          for (const line of failedOutputLines(coding.output)) {
            writeLine(`    ${line}`)
          }
        }
        return
      case "file-change": {
        const changes = coding.changes
          .map((change) => `${FILE_CHANGE_VERBS[change.kind]} ${change.path}`)
          .join(", ")
        writeLine(
          coding.status === "completed"
            ? `  Edited: ${changes}`
            : `  Edit failed: ${changes}`,
        )
        return
      }
      case "todo":
        writeLine(`  Plan: ${coding.text}`)
        return
      case "tool-call":
        if (coding.status === "started") {
          writeLine(`  Tool: ${coding.server}.${coding.tool}`)
        } else if (coding.status === "failed") {
          writeLine(`  Tool failed: ${coding.server}.${coding.tool}`)
        }
        return
      case "web-search":
        writeLine(`  Search: ${coding.query}`)
        return
      case "error":
        writeLine(`${stamp(event)} Codex error: ${coding.message}`)
        return
    }
  }

  const finalLine = (
    event: PlanImplementationEvent,
    result: PlanImplementationFinalResult,
  ): string => {
    const base = `${stamp(event)} Result: ${result.outcome}`
    const reason =
      result.outcome === "stopped"
        ? ` — ${result.reason.replace(/\.$/, "")}`
        : ""
    const total = ` Total ${formatDuration(elapsedMs(event))}.`
    const transcript = result.transcriptPath
      ? ` Transcript: ${result.transcriptPath}`
      : ""
    return `${base}${reason}.${total}${transcript}`
  }

  return {
    event(event: PlanImplementationEvent) {
      switch (event.kind) {
        case "run-started": {
          const startMs = Date.parse(event.timestamp)
          runStartMs = Number.isNaN(startMs) ? null : startMs
          totalSteps = event.totalSteps
          writeLine(
            `${stamp(event)} Plan ${event.source.planName}: ${totalSteps} ${totalSteps === 1 ? "step" : "steps"}, ${runMode(event.request)}, ceiling ${event.resolvedCeiling ?? "unresolved"}.`,
          )
          return
        }
        case "step-started":
          stepStartMs = Date.parse(event.timestamp)
          writeBlank()
          writeLine(
            `${stamp(event)} Step ${event.step}/${totalSteps}: ${event.title}`,
          )
          return
        case "phase-changed":
          writeLine(`${stamp(event)} Phase: ${event.phase}`)
          return
        case "coding":
          codingLine(event, event.event)
          return
        case "command-started":
          commandLabels.set(event.commandId, event.label)
          writeLine(
            `${stamp(event)} Command started: ${event.label} (${[event.program, ...event.arguments].join(" ")})`,
          )
          return
        case "command-finished":
          writeLine(
            `${stamp(event)} Command ${event.status}: ${commandLabels.get(event.commandId) ?? event.commandId}`,
          )
          return
        case "stop-requested":
          writeLine(`${stamp(event)} Stop requested.`)
          return
        case "step-committed": {
          const eventMs = Date.parse(event.timestamp)
          const duration =
            stepStartMs === null || Number.isNaN(eventMs)
              ? ""
              : ` after ${formatDuration(eventMs - stepStartMs)}`
          writeLine(
            `${stamp(event)} Committed step ${event.step}${duration}: ${event.commitOid.slice(0, 12)} ${event.subject}`,
          )
          return
        }
        case "run-finished":
          writeLine(finalLine(event, event.result))
      }
    },
  }
}
