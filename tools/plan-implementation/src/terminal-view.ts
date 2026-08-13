import { codingCommandActivity } from "./coding-command-display.js"
import type {
  CodingEvent,
  PlanImplementationEvent,
  PlanImplementationFinalResult,
  PlanImplementationRunRequest,
} from "./contracts.js"
import type { PlanImplementationEventObserver } from "./progress-events.js"
import type { TerminalDisplay } from "./terminal-output.js"

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

const FILE_CHANGE_VERBS = {
  add: "created",
  update: "updated",
  delete: "deleted",
} as const

function failedOutputSummary(output: string): string {
  const lines = output.split("\n").filter((line) => line.trim() !== "")
  const lastLine = lines.at(-1)?.replaceAll(/\s+/g, " ").trim()
  if (lastLine === undefined) return ""
  return lastLine.length <= 160
    ? ` — ${lastLine}`
    : ` — ${lastLine.slice(0, 157)}...`
}

export function createTerminalView(
  display: TerminalDisplay,
): PlanImplementationEventObserver {
  let totalSteps = 0
  let runStartMs: number | null = null
  let stepStartMs: number | null = null
  const commandLabels = new Map<string, string>()

  const writeLine = (line: string): void => {
    display.overview(line)
  }
  const writeBlank = (): void => {
    writeLine("")
  }
  const writeDetail = (line: string): void => {
    display.detail(line.replaceAll(/\s+/g, " ").trim())
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
        writeDetail(`${stamp(event)} Codex thread ${coding.threadId}`)
        return
      case "narrative":
        writeBlank()
        writeLine(`${stamp(event)} ${coding.text}`)
        writeBlank()
        return
      case "command":
        if (coding.status === "failed") {
          const exit =
            coding.exitCode === null ? "" : ` (exit ${coding.exitCode})`
          writeLine(
            `${stamp(event)} ${codingCommandActivity(coding.command, coding.status)}${exit}${failedOutputSummary(coding.output)}`,
          )
        } else {
          writeDetail(
            `${stamp(event)} ${codingCommandActivity(coding.command, coding.status)}`,
          )
        }
        return
      case "file-change": {
        const changes = coding.changes
          .map((change) => `${FILE_CHANGE_VERBS[change.kind]} ${change.path}`)
          .join(", ")
        writeDetail(
          coding.status === "completed"
            ? `${stamp(event)} Edited: ${changes}`
            : `${stamp(event)} Edit failed: ${changes}`,
        )
        return
      }
      case "todo":
        writeDetail(`${stamp(event)} Plan: ${coding.text}`)
        return
      case "tool-call":
        if (coding.status === "started") {
          writeDetail(
            `${stamp(event)} Use tool: ${coding.server}.${coding.tool}`,
          )
        } else if (coding.status === "succeeded") {
          writeDetail(
            `${stamp(event)} Finished tool: ${coding.server}.${coding.tool}`,
          )
        } else if (coding.status === "failed") {
          writeDetail(
            `${stamp(event)} Tool failed: ${coding.server}.${coding.tool}`,
          )
        }
        return
      case "web-search":
        writeDetail(`${stamp(event)} Search web: ${coding.query}`)
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
          writeDetail(`${stamp(event)} Run: ${event.label}`)
          return
        case "command-finished": {
          const label = commandLabels.get(event.commandId) ?? event.commandId
          if (event.status === "failed") {
            writeLine(`${stamp(event)} Failed: ${label}`)
          } else {
            writeDetail(`${stamp(event)} Finished: ${label}`)
          }
          return
        }
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
    close() {
      display.close()
    },
  }
}
