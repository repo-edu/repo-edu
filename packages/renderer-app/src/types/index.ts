import type { RosterValidationKind } from "@repo-edu/domain/types"

export type { ActiveTab } from "@repo-edu/domain/types"

export type ConnectionStatus =
  | "disconnected"
  | "verifying"
  | "connected"
  | "error"

export type CourseStatus = "unknown" | "verifying" | "verified" | "failed"

export type ChecksStatus = "idle" | "running" | "ready" | "error"

export type DocumentStatus = "empty" | "loading" | "loaded" | "error"

export type StoreStatus = "loading" | "loaded" | "saving" | "error"

export type LoadResult = {
  ok: boolean
  warnings: string[]
  error: string | null
}

export const okResult = (warnings: string[] = []): LoadResult => ({
  ok: true,
  warnings,
  error: null,
})

export const errorResult = (error: string): LoadResult => ({
  ok: false,
  warnings: [],
  error,
})

export type IssueCard = {
  id: string
  kind:
    | "unknown_students"
    | "empty_groups"
    | "roster_validation"
    | "assignment_validation"
  assignmentId?: string
  groupSetId?: string
  groupSetName?: string
  emptyGroupNames?: string[]
  title: string
  description?: string
  count: number
  details?: string[]
  issueKind?: RosterValidationKind
}

export type RosterInsights = {
  activeCount: number
  droppedCount: number
  incompleteCount: number
  missingEmailCount: number
  missingGitUsernameCount: number
}

export type ToastTone = "info" | "success" | "warning" | "error"

export type ToastAction = {
  label: string
  onClick: () => void
}

export type ToastItem = {
  id: string
  message: string
  tone: ToastTone
  durationMs: number
  action?: ToastAction
}
