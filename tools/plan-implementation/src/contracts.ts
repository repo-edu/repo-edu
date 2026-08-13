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

type FinalResultFields = {
  readonly resolvedCeiling: number | null
  readonly transcriptPath: string | null
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
  | (EventFields & {
      readonly kind: "run-started"
      readonly invocationId: string
      readonly source: PlanSourceIdentity
      readonly request: PlanImplementationRunRequest
      readonly resolvedCeiling: number | null
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
      readonly kind: "coding-activity"
      readonly step: number
      readonly label: string
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
