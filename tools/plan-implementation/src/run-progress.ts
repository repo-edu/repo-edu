import type {
  CodingEvent,
  PlanImplementationFinalResult,
  PlanImplementationPhase,
  PlanImplementationRunRequest,
  PlanSourceIdentity,
} from "./contracts.js"
import {
  createPlanImplementationEventStream,
  type PlanImplementationEventObserver,
} from "./progress-events.js"
import type { StepCommandObserver } from "./step-checks.js"
import {
  createPlanImplementationTranscript,
  type PlanImplementationTranscriptFactory,
} from "./transcript.js"

export type PlanImplementationRunProgress = {
  readonly transcriptPath: string
  readonly commands: StepCommandObserver
  start(resolvedCeiling: number | null): void
  requestStop(): void
  stepStarted(step: number, title: string): void
  phaseChanged(phase: PlanImplementationPhase): void
  codingEvent(step: number, event: CodingEvent): void
  stepCommitted(step: number, commitOid: string, subject: string): void
  finish(result: PlanImplementationFinalResult): void
  close(): void
}

export async function createPlanImplementationRunProgress(options: {
  readonly repoEduRoot: string
  readonly source: PlanSourceIdentity
  readonly request: PlanImplementationRunRequest
  readonly totalSteps: number
  readonly presentation?: PlanImplementationEventObserver
  readonly createTranscript?: PlanImplementationTranscriptFactory
  readonly now?: () => Date
}): Promise<PlanImplementationRunProgress> {
  const createTranscript =
    options.createTranscript ?? createPlanImplementationTranscript
  const transcript = await createTranscript(options.repoEduRoot)
  const events = createPlanImplementationEventStream({
    transcript,
    presentation: options.presentation,
    now: options.now,
  })
  let started = false
  let stopPending = false
  let stopEmitted = false

  const emitStop = (): void => {
    if (!started || !stopPending || stopEmitted) return
    events.emit({ kind: "stop-requested" })
    stopEmitted = true
  }
  const commands: StepCommandObserver = {
    commandStarted(command) {
      events.emit({
        kind: "command-started",
        commandId: command.id,
        label: command.label,
        program: command.program,
        arguments: command.arguments,
      })
    },
    commandFinished(command, status) {
      events.emit({
        kind: "command-finished",
        commandId: command.id,
        status,
      })
    },
  }

  return {
    transcriptPath: transcript.path,
    commands,
    start(resolvedCeiling) {
      if (started) {
        throw new Error("Run progress can start only once.")
      }
      events.emit({
        kind: "run-started",
        invocationId: transcript.invocationId,
        source: options.source,
        request: options.request,
        resolvedCeiling,
        totalSteps: options.totalSteps,
      })
      started = true
      events.emit({ kind: "phase-changed", phase: "admission" })
      emitStop()
    },
    requestStop() {
      stopPending = true
      emitStop()
    },
    stepStarted(step, title) {
      events.emit({ kind: "step-started", step, title })
    },
    phaseChanged(phase) {
      events.emit({ kind: "phase-changed", phase })
    },
    codingEvent(step, event) {
      events.emit({
        kind: "coding-activity",
        step,
        label:
          event.kind === "thread-started"
            ? `Started Codex thread ${event.threadId}.`
            : event.label,
      })
    },
    stepCommitted(step, commitOid, subject) {
      events.emit({
        kind: "step-committed",
        step,
        commitOid,
        subject,
      })
    },
    finish(result) {
      events.emit({ kind: "run-finished", result })
    },
    close() {
      events.close()
    },
  }
}
