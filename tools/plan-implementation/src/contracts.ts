export type PlanSourceIdentity = {
  readonly planName: string
  readonly planPath: string
  readonly commitOid: string
  readonly blobOid: string
}

export type PlanSourcePoint = {
  readonly line: number
  readonly column: number
  readonly offset: number
}

export type PlanSourceSpan = {
  readonly start: PlanSourcePoint
  readonly end: PlanSourcePoint
}

export type CompleteRunRequest = {
  readonly mode: "complete"
}

export type CountRunRequest = {
  readonly mode: "count"
  readonly count: number
}

export type ThroughStepRunRequest = {
  readonly mode: "through-step"
  readonly throughStep: number
}

export type PlanImplementationRunRequest =
  | CompleteRunRequest
  | CountRunRequest
  | ThroughStepRunRequest

export type PlanMachineProof = {
  readonly program: string
  readonly arguments: readonly string[]
  readonly "user-action"?: never
}

export type PlanUserActionProof = {
  readonly "user-action": string
  readonly program?: never
  readonly arguments?: never
}

export type PlanProof = PlanMachineProof | PlanUserActionProof

export type PlanStepProofList = {
  readonly items: readonly PlanProof[]
  readonly sourceSpan: PlanSourceSpan | null
}

export type PlanImplementationStep = {
  readonly number: number
  readonly title: string
  readonly sourceSpan: PlanSourceSpan
  readonly proofs: PlanStepProofList
}

export type CommittedImplementationPlan = {
  readonly source: PlanSourceIdentity
  readonly markdown: string
  readonly implementationListSpan: PlanSourceSpan
  readonly steps: readonly PlanImplementationStep[]
}

export type CommittedPlanSource = Pick<
  CommittedImplementationPlan,
  "source" | "markdown"
>

export type CodingCommitProposal = {
  readonly subject: string
  readonly decisionBullets: readonly string[]
}

export type CodingResult =
  | {
      readonly status: "succeeded"
      readonly commit: CodingCommitProposal
    }
  | {
      readonly status: "blocked"
      readonly reason: string
    }

export type CodingRequest = {
  readonly repoEduRoot: string
  readonly plan: CommittedImplementationPlan
  readonly activeStep: number
}

export type CodingFileChange = {
  readonly path: string
  readonly kind: "add" | "delete" | "update"
}

export type CodingTokenUsage = {
  readonly inputTokens: number
  readonly cachedInputTokens: number
  readonly cacheWriteInputTokens: number
  readonly outputTokens: number
  readonly reasoningOutputTokens: number
}

export type CodingEvent =
  | {
      readonly kind: "thread-started"
      readonly threadId: string
    }
  | {
      readonly kind: "narrative"
      readonly text: string
    }
  | {
      readonly kind: "command"
      readonly command: string
      readonly status: "started" | "succeeded" | "failed"
      readonly exitCode: number | null
      readonly output: string
    }
  | {
      readonly kind: "file-change"
      readonly status: "completed" | "failed"
      readonly changes: readonly CodingFileChange[]
    }
  | {
      readonly kind: "todo"
      readonly text: string
    }
  | {
      readonly kind: "tool-call"
      readonly server: string
      readonly tool: string
      readonly status: "started" | "succeeded" | "failed"
    }
  | {
      readonly kind: "web-search"
      readonly query: string
    }
  | {
      readonly kind: "error"
      readonly message: string
    }
  | {
      readonly kind: "usage"
      readonly tokens: CodingTokenUsage
    }

export type CodingRun = {
  readonly events: AsyncIterable<CodingEvent>
  readonly result: Promise<CodingResult>
  abort(): void
}

export type CodingAdapter = {
  start(request: CodingRequest, signal?: AbortSignal): Promise<CodingRun>
}

export const PLAN_IMPLEMENTATION_PHASES = [
  "admission",
  "implementing",
  "checking",
  "committing",
] as const

export type PlanImplementationPhase =
  (typeof PLAN_IMPLEMENTATION_PHASES)[number]

export const PLAN_IMPLEMENTATION_OUTCOMES = [
  "completed",
  "bound-reached",
  "stopped",
] as const

export type PlanImplementationOutcome =
  (typeof PLAN_IMPLEMENTATION_OUTCOMES)[number]

type RunCeilingField = {
  /**
   * The inclusive highest step number in the work range granted to this run.
   *
   * A number is a positive integer no greater than the plan's final step.
   * `null` means preflight stopped before the runner granted a work range.
   * This value reports the allowed range, not progress.
   * It does not name the last started or committed step.
   * An already complete plan uses its final step even though no work remains.
   */
  readonly resolvedCeiling: number | null
}

type FinalResultFields = RunCeilingField & {
  /**
   * The absolute path of this run's JSON Lines transcript.
   *
   * Every run that produces a final result has already opened its transcript,
   * so this path is always present. A command-input error and the cursor-reset
   * action report their result directly and produce no final result at all.
   */
  readonly transcriptPath: string
}

type FinalOutcome =
  | { readonly outcome: "completed" }
  | { readonly outcome: "bound-reached" }
  | { readonly outcome: "stopped"; readonly reason: string }

export type PlanImplementationFinalResult = PlanImplementationRunRequest &
  FinalResultFields &
  FinalOutcome

type EventFields = {
  readonly timestamp: string
}

export type PlanImplementationEvent =
  | (EventFields &
      RunCeilingField & {
        readonly kind: "run-started"
        readonly invocationId: string
        readonly source: PlanSourceIdentity
        readonly request: PlanImplementationRunRequest
        readonly totalSteps: number
      })
  | (EventFields & {
      readonly kind: "step-started"
      readonly step: number
      readonly title: string
    })
  | (EventFields & {
      readonly kind: "phase-changed"
      readonly phase: PlanImplementationPhase
    })
  | (EventFields & {
      readonly kind: "coding"
      readonly step: number
      readonly event: CodingEvent
    })
  | (EventFields & {
      readonly kind: "command-started"
      readonly commandId: string
      readonly label: string
      readonly program: string
      readonly arguments: readonly string[]
    })
  | (EventFields & {
      readonly kind: "command-finished"
      readonly commandId: string
      readonly status: "succeeded" | "failed" | "stopped"
    })
  | (EventFields & {
      readonly kind: "stop-requested"
    })
  | (EventFields & {
      readonly kind: "step-committed"
      readonly step: number
      readonly commitOid: string
      readonly subject: string
    })
  | (EventFields & {
      readonly kind: "run-finished"
      readonly result: PlanImplementationFinalResult
    })
