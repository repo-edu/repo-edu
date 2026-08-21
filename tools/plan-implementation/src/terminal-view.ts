import { codingCommandActivity } from "./coding-command-display.js"
import type {
  CodingEvent,
  PlanImplementationEvent,
  PlanImplementationFinalResult,
  PlanImplementationRunRequest,
} from "./contracts.js"
import type { PlanImplementationEventObserver } from "./progress-events.js"
import type { TerminalDisplay } from "./terminal-output.js"

type RunnerCommandStatus = Extract<
  PlanImplementationEvent,
  { readonly kind: "command-finished" }
>["status"]

const RUNNER_COMMAND_RESULT = {
  succeeded: "Finished",
  failed: "Failed",
  stopped: "Stopped",
} as const satisfies Record<RunnerCommandStatus, string>

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

function oneLine(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim()
}

function contextOccupancy(
  event: Extract<CodingEvent, { kind: "usage" }>,
): string {
  const used = event.usage.lastContext.totalTokens
  const window = event.usage.modelContextWindowTokens
  if (window === null || window <= 0) {
    return `${used} tokens (window unavailable)`
  }
  const percent = ((used / window) * 100).toFixed(1)
  return `${used}/${window} tokens (${percent}%)`
}

function cumulativeUsage(
  event: Extract<CodingEvent, { kind: "usage" }>,
): string {
  const tokens = event.usage.cumulative
  return `${tokens.inputTokens} input tokens (${tokens.cachedInputTokens} cached, ${tokens.cacheWriteInputTokens} cache write); ${tokens.outputTokens} output tokens (${tokens.reasoningOutputTokens} reasoning); ${tokens.totalTokens} total tokens`
}

function approvalPolicy(
  policy: Extract<
    CodingEvent,
    { kind: "thread-started" }
  >["effectiveApprovalPolicy"],
): string {
  if (typeof policy === "string") return policy
  const setting = (value: boolean | null): string =>
    value === null ? "unset" : String(value)
  return `granular (MCP elicitations ${setting(policy.mcpElicitations)}, request permissions ${setting(policy.requestPermissions)}, rules ${setting(policy.rules)}, sandbox approval ${setting(policy.sandboxApproval)}, skill approval ${setting(policy.skillApproval)})`
}

export function createTerminalView(
  display: TerminalDisplay,
  now: () => number = Date.now,
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
  const elapsedMs = (event: PlanImplementationEvent): number => {
    const eventMs = Date.parse(event.timestamp)
    return runStartMs === null || Number.isNaN(eventMs)
      ? 0
      : eventMs - runStartMs
  }
  const stamp = (event: PlanImplementationEvent): string =>
    `[${formatClock(elapsedMs(event))}]`
  const liveLine = (
    event: PlanImplementationEvent,
    line?: string,
  ): (() => string) => {
    const initialElapsedMs = elapsedMs(event)
    const observedAtMs = now()
    const detail = line?.replaceAll(/\s+/g, " ").trim()
    return () => {
      const liveElapsedMs = initialElapsedMs + Math.max(0, now() - observedAtMs)
      const liveStamp = `[${formatClock(liveElapsedMs)}]`
      return detail === undefined ? liveStamp : `${liveStamp} ${detail}`
    }
  }
  const writeDetail = (event: PlanImplementationEvent, line: string): void => {
    display.detail(liveLine(event, line))
  }
  const writeProgress = (
    event: PlanImplementationEvent,
    line: string,
  ): void => {
    display.progress(liveLine(event, line))
  }
  const writeIdle = (event: PlanImplementationEvent): void => {
    display.detail(liveLine(event))
  }
  const writeOverview = (
    event: PlanImplementationEvent,
    line: string,
  ): void => {
    writeLine(line)
    writeIdle(event)
  }

  const codingLine = (
    event: PlanImplementationEvent,
    coding: CodingEvent,
  ): void => {
    switch (coding.kind) {
      case "thread-started":
        writeOverview(
          event,
          `${stamp(event)} Codex thread ${coding.threadId}: effective reviewer ${coding.effectiveApprovalsReviewer}; approval policy ${approvalPolicy(coding.effectiveApprovalPolicy)}.`,
        )
        return
      case "narrative":
        writeBlank()
        writeLine(`${stamp(event)} ${coding.text}`)
        writeBlank()
        writeIdle(event)
        return
      case "command":
        if (coding.status === "started") {
          writeDetail(
            event,
            codingCommandActivity(coding.command, coding.status),
          )
        } else {
          const exit =
            coding.status === "failed" && coding.exitCode !== null
              ? ` (exit ${coding.exitCode})`
              : ""
          const output =
            coding.status === "failed" ? failedOutputSummary(coding.output) : ""
          writeOverview(
            event,
            `${stamp(event)} ${codingCommandActivity(coding.command, coding.status)}${exit}${output}`,
          )
        }
        return
      case "file-change": {
        const changes = coding.changes
          .map((change) => `${FILE_CHANGE_VERBS[change.kind]} ${change.path}`)
          .join(", ")
        writeDetail(
          event,
          coding.status === "completed"
            ? `Edited: ${changes}`
            : `Edit failed: ${changes}`,
        )
        return
      }
      case "todo":
        writeDetail(event, `Plan: ${coding.text}`)
        return
      case "tool-call":
        if (coding.status === "started") {
          writeDetail(event, `Use tool: ${coding.server}.${coding.tool}`)
        } else if (coding.status === "succeeded") {
          writeOverview(
            event,
            `${stamp(event)} Finished tool: ${coding.server}.${coding.tool}`,
          )
        } else if (coding.status === "failed") {
          writeDetail(event, `Tool failed: ${coding.server}.${coding.tool}`)
        }
        return
      case "web-search":
        writeDetail(event, `Search web: ${coding.query}`)
        return
      case "error":
        writeOverview(
          event,
          `${stamp(event)} Codex error (${coding.willRetry ? "retrying" : "no retry"}): ${oneLine(coding.message)}`,
        )
        return
      case "usage":
        writeOverview(
          event,
          `${stamp(event)} Context: ${contextOccupancy(coding)}; cumulative: ${cumulativeUsage(coding)}.`,
        )
        return
      case "warning": {
        const source = coding.source === "guardian" ? "Guardian" : "App-server"
        writeOverview(
          event,
          `${stamp(event)} ${source} warning: ${oneLine(coding.message)}`,
        )
        return
      }
      case "context-compaction":
        if (coding.status === "started") {
          writeDetail(event, "Compacting context")
        } else {
          writeOverview(event, `${stamp(event)} Context compaction completed.`)
        }
        return
      case "approval-review":
        if (coding.status === "inProgress") {
          writeDetail(
            event,
            `Automatic review: ${oneLine(coding.action.summary)}`,
          )
        } else {
          writeOverview(
            event,
            `${stamp(event)} Automatic review ${coding.status}: ${oneLine(coding.action.summary)}`,
          )
        }
        return
      case "human-review":
        writeOverview(
          event,
          coding.status === "requested"
            ? `${stamp(event)} Human review requested (${coding.category}): ${oneLine(coding.summary)}`
            : `${stamp(event)} Human review ${coding.decision} (${coding.category}): ${oneLine(coding.summary)}`,
        )
        return
      case "request-refused":
        writeOverview(
          event,
          `${stamp(event)} Request refused (${coding.response}): ${oneLine(coding.summary)}`,
        )
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
        ? ` — ${result.reason.replaceAll(/\s+/g, " ").trim().replace(/\.$/, "")}`
        : ""
    const total = ` Total ${formatDuration(elapsedMs(event))}.`
    return `${base}${reason}.${total} Transcript: ${result.transcriptPath}`
  }

  return {
    event(event: PlanImplementationEvent) {
      switch (event.kind) {
        case "run-started": {
          const startMs = Date.parse(event.timestamp)
          runStartMs = Number.isNaN(startMs) ? null : startMs
          totalSteps = event.totalSteps
          writeOverview(
            event,
            `${stamp(event)} Plan ${event.source.planName}: ${totalSteps} ${totalSteps === 1 ? "step" : "steps"}, ${runMode(event.request)}, ceiling ${event.resolvedCeiling ?? "unresolved"}.`,
          )
          return
        }
        case "step-started":
          stepStartMs = Date.parse(event.timestamp)
          writeBlank()
          writeOverview(
            event,
            `${stamp(event)} Step ${event.step}/${totalSteps}: ${event.title}`,
          )
          return
        case "phase-changed":
          writeOverview(event, `${stamp(event)} Phase: ${event.phase}`)
          return
        case "coding":
          codingLine(event, event.event)
          return
        case "command-started":
          commandLabels.set(event.commandId, event.label)
          writeProgress(event, `Run: ${event.label}`)
          return
        case "command-finished": {
          const label = commandLabels.get(event.commandId) ?? event.commandId
          writeOverview(
            event,
            `${stamp(event)} ${RUNNER_COMMAND_RESULT[event.status]}: ${label}`,
          )
          return
        }
        case "stop-requested":
          writeOverview(event, `${stamp(event)} Stop requested.`)
          return
        case "step-committed": {
          const eventMs = Date.parse(event.timestamp)
          const duration =
            stepStartMs === null || Number.isNaN(eventMs)
              ? ""
              : ` after ${formatDuration(eventMs - stepStartMs)}`
          writeOverview(
            event,
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
