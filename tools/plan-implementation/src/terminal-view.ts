import type {
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

function finalLine(result: PlanImplementationFinalResult): string {
  const base = `Result: ${result.outcome}`
  const reason = result.outcome === "stopped" ? ` — ${result.reason}` : ""
  const transcript = result.transcriptPath
    ? ` Transcript: ${result.transcriptPath}`
    : ""
  return `${base}${reason}.${transcript}`
}

export function createTerminalView(
  output: TerminalOutput,
): PlanImplementationEventObserver {
  let totalSteps = 0
  const commandLabels = new Map<string, string>()
  const shownCodingDetail = new Set<string>()

  const writeLine = (line: string): void => {
    output.write(`${line}\n`)
  }

  return {
    event(event: PlanImplementationEvent) {
      switch (event.kind) {
        case "run-started":
          totalSteps = event.totalSteps
          writeLine(
            `Plan ${event.source.planName}: ${totalSteps} ${totalSteps === 1 ? "step" : "steps"}, ${runMode(event.request)}, ceiling ${event.resolvedCeiling ?? "unresolved"}.`,
          )
          return
        case "step-started":
          writeLine(`Step ${event.step}/${totalSteps}: ${event.title}`)
          return
        case "phase-changed":
          writeLine(`Phase: ${event.phase}`)
          return
        case "coding-activity": {
          const key = `${event.step}\0${event.label}`
          if (shownCodingDetail.has(key)) return
          shownCodingDetail.add(key)
          writeLine(`Codex: ${event.label}`)
          return
        }
        case "command-started":
          commandLabels.set(event.commandId, event.label)
          writeLine(
            `Command started: ${event.label} (${[event.program, ...event.arguments].join(" ")})`,
          )
          return
        case "command-finished":
          writeLine(
            `Command ${event.status}: ${commandLabels.get(event.commandId) ?? event.commandId}`,
          )
          return
        case "stop-requested":
          writeLine("Stop requested.")
          return
        case "step-committed":
          writeLine(
            `Committed step ${event.step}: ${event.commitOid.slice(0, 12)} ${event.subject}`,
          )
          return
        case "run-finished":
          writeLine(finalLine(event.result))
      }
    },
  }
}
