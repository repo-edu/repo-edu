import type {
  GitProviderKind,
  LmsProviderKind,
  RosterValidationIssue,
  ValidationIssue,
} from "@repo-edu/domain/types"

export type AppValidationIssue = ValidationIssue | RosterValidationIssue

export type TransportErrorReason =
  | "ipc-disconnected"
  | "serialization"
  | "host-crash"
  | "timeout"

export type AppError =
  | {
      type: "transport"
      message: string
      reason: TransportErrorReason
      retryable: boolean
    }
  | {
      type: "cancelled"
      message: string
    }
  | {
      type: "validation"
      message: string
      issues: AppValidationIssue[]
    }
  | {
      type: "not-found"
      message: string
      resource:
        | "connection"
        | "course"
        | "group-set"
        | "assignment"
        | "repository"
        | "file"
    }
  | {
      type: "conflict"
      message: string
      resource:
        | "course"
        | "connection"
        | "group-set"
        | "assignment"
        | "repository"
        | "file"
      reason: string
    }
  | {
      type: "provider"
      message: string
      provider: LmsProviderKind | GitProviderKind | "git" | "llm"
      operation: string
      retryable: boolean
    }
  | {
      type: "persistence"
      message: string
      operation: "read" | "write" | "decode" | "encode"
      retryable: boolean
      pathHint?: string
    }
  | {
      type: "unexpected"
      message: string
      retryable: boolean
    }

export const appErrorOwnership = {
  transport:
    "Only transport adapters may create transport errors when IPC or bridge mechanics fail.",
  cancelled:
    "Transport adapters and packages/application may create cancelled when the caller-owned AbortSignal stops work.",
  validation:
    "Only packages/application may normalize validation failures into the shared validation variant.",
  "not-found":
    "Only packages/application may expose not-found after domain, persistence, or provider lookup misses.",
  conflict:
    "Only packages/application may expose conflict after detecting write or identity collisions.",
  provider:
    "Only packages/application may normalize LMS, Git, or subprocess adapter failures into provider errors.",
  persistence:
    "Only packages/application may normalize settings, course, and user-file boundary failures into persistence errors.",
  unexpected:
    "Only packages/application may expose unexpected as the final catch-all for unknown failures.",
} as const

export function createTransportAppError(
  reason: TransportErrorReason,
  message: string,
  retryable = true,
): AppError {
  return {
    type: "transport",
    message,
    reason,
    retryable,
  }
}

export function createCancelledAppError(
  message = "Workflow was cancelled.",
): AppError {
  return {
    type: "cancelled",
    message,
  }
}

const appErrorTypes = new Set<string>([
  "transport",
  "cancelled",
  "validation",
  "not-found",
  "conflict",
  "provider",
  "persistence",
  "unexpected",
])

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string" &&
    appErrorTypes.has(value.type)
  )
}
