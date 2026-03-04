export const packageId = "@repo-edu/application-contract"

// ---------------------------------------------------------------------------
// Workflow event protocol (architecture plan §4 / Subscription Event Protocol)
// ---------------------------------------------------------------------------

/**
 * Discriminated event union yielded by every long-running tRPC subscription.
 *
 * Protocol:
 * - Zero or more `progress` and `output` events in any order.
 * - Exactly one terminal event (`completed` or `failed`).
 * - Then the observable completes.
 */
export type WorkflowEvent<TProgress, TOutput, TResult> =
  | { type: "progress"; data: TProgress }
  | { type: "output"; data: TOutput }
  | { type: "completed"; data: TResult }
  | { type: "failed"; error: AppError }

// ---------------------------------------------------------------------------
// AppError — minimal taxonomy for the spike (architecture plan §5)
// ---------------------------------------------------------------------------

export type AppError =
  | { type: "transport"; message: string; reason: TransportErrorReason }
  | { type: "validation"; message: string; field?: string }
  | { type: "integration"; message: string; provider?: string }
  | { type: "not-found"; message: string; entity?: string }
  | { type: "cancelled"; message: string }
  | { type: "internal"; message: string }

export type TransportErrorReason =
  | "ipc-disconnected"
  | "serialization"
  | "host-crash"
  | "timeout"

// ---------------------------------------------------------------------------
// Spike workflow types (phase 1.3 proof-of-concept)
// ---------------------------------------------------------------------------

export type SpikeWorkflowProgress = {
  step: number
  totalSteps: number
  label: string
}

export type SpikeWorkflowOutput = {
  line: string
}

export type SpikeWorkflowResult = {
  workflowId: "spike.e2e-trpc"
  message: string
  packageLine: string
  executedAt: string
}

export type SpikeWorkflowEvent = WorkflowEvent<
  SpikeWorkflowProgress,
  SpikeWorkflowOutput,
  SpikeWorkflowResult
>

// ---------------------------------------------------------------------------
// Workflow call options (architecture plan §4 / §5)
// ---------------------------------------------------------------------------

export type WorkflowCallOptions<TProgress, TOutput> = {
  onProgress?: (event: TProgress) => void
  onOutput?: (event: TOutput) => void
  signal?: AbortSignal
}

// ---------------------------------------------------------------------------
// Spike CORS workflow types (phase 1.3 — Node-side HTTP proof-of-concept)
// ---------------------------------------------------------------------------

export type SpikeCorsWorkflowProgress = {
  step: number
  totalSteps: number
  label: string
}

export type SpikeCorsWorkflowOutput = {
  line: string
}

export type SpikeCorsWorkflowResult = {
  workflowId: "spike.cors-http"
  executedIn: "node"
  httpStatus: number
  bodySnippet: string
  executedAt: string
}

export type SpikeCorsWorkflowEvent = WorkflowEvent<
  SpikeCorsWorkflowProgress,
  SpikeCorsWorkflowOutput,
  SpikeCorsWorkflowResult
>
