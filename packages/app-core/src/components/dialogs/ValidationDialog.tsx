/**
 * Dialog for showing roster/assignment validation results.
 * Displays blocking errors or warnings before operation execution.
 */

import type {
  ValidationIssue,
  ValidationKind,
} from "@repo-edu/backend-interface/types"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo-edu/ui"
import { AlertCircle } from "@repo-edu/ui/components/icons"
import { useUiStore } from "../../stores/uiStore"

/** ValidationKinds that block operations (errors, not warnings) */
const BLOCKING_KINDS: Set<ValidationKind> = new Set([
  "duplicate_student_id",
  "duplicate_email",
  "duplicate_assignment_name",
  "duplicate_group_id_in_assignment",
  "duplicate_group_name_in_assignment",
  "duplicate_repo_name_in_assignment",
  "student_in_multiple_groups_in_assignment",
  "orphan_group_member",
])

function isBlockingIssue(kind: ValidationKind): boolean {
  return BLOCKING_KINDS.has(kind)
}

interface ValidationDialogProps {
  /** Callback when user clicks "Proceed Anyway" for warnings */
  onProceed?: () => void
}

export function ValidationDialog({ onProceed }: ValidationDialogProps) {
  const open = useUiStore((state) => state.validationDialogOpen)
  const setOpen = useUiStore((state) => state.setValidationDialogOpen)
  const validationResult = useUiStore((state) => state.validationResult)

  if (!validationResult) return null

  const issues = validationResult.issues
  const blockingIssues = issues.filter((i) => isBlockingIssue(i.kind))
  const warningIssues = issues.filter((i) => !isBlockingIssue(i.kind))
  const hasBlocking = blockingIssues.length > 0

  const handleProceed = () => {
    setOpen(false)
    onProceed?.()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle
              className={`size-5 ${hasBlocking ? "text-destructive" : "text-warning"}`}
            />
            {hasBlocking ? "Cannot Proceed" : "Warnings"}
          </DialogTitle>
          <DialogDescription>
            {hasBlocking
              ? "The following issues must be fixed before proceeding:"
              : "The following issues were found. You can proceed anyway."}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 overflow-y-auto py-4">
          {blockingIssues.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-destructive mb-2">
                Errors ({blockingIssues.length})
              </h4>
              <IssueList issues={blockingIssues} variant="error" />
            </div>
          )}

          {warningIssues.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-warning mb-2">
                Warnings ({warningIssues.length})
              </h4>
              <IssueList issues={warningIssues} variant="warning" />
            </div>
          )}
        </div>

        <DialogFooter>
          {hasBlocking ? (
            <Button onClick={() => setOpen(false)}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleProceed}>Proceed Anyway</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface IssueListProps {
  issues: ValidationIssue[]
  variant: "error" | "warning"
}

function IssueList({ issues, variant }: IssueListProps) {
  const iconClass = variant === "error" ? "text-destructive" : "text-yellow-600"

  return (
    <ul className="space-y-2 text-sm">
      {issues.map((issue, i) => (
        <li key={i} className="flex gap-2">
          <span className={iconClass}>{variant === "error" ? "✗" : "⚠"}</span>
          <span>{formatIssue(issue)}</span>
        </li>
      ))}
    </ul>
  )
}

function formatIssue(issue: ValidationIssue): string {
  const count = issue.affected_ids.length
  const context = issue.context

  switch (issue.kind) {
    case "duplicate_student_id":
      return `Duplicate student ID: ${context ?? "unknown"} (${count} students)`
    case "duplicate_email":
      return `Duplicate email: ${context ?? "unknown"} (${count} students)`
    case "duplicate_assignment_name":
      return `Duplicate assignment name: ${context ?? "unknown"}`
    case "duplicate_group_id_in_assignment":
      return `Duplicate group ID in assignment (${count} groups)`
    case "duplicate_group_name_in_assignment":
      return `Duplicate group name: ${context ?? "unknown"} (${count} groups)`
    case "duplicate_repo_name_in_assignment":
      return `Duplicate repo name: ${context ?? "unknown"} (${count} groups)`
    case "student_in_multiple_groups_in_assignment":
      return `Student in multiple groups: ${context ?? "unknown"}`
    case "orphan_group_member":
      return `${count} group member${count !== 1 ? "s" : ""} reference unknown student${count !== 1 ? "s" : ""}`
    case "missing_git_username":
      return `${count} student${count !== 1 ? "s" : ""} missing git username (will be skipped)`
    case "invalid_git_username":
      return `${count} student${count !== 1 ? "s" : ""} with invalid git username`
    case "empty_group":
      return `${count} empty group${count !== 1 ? "s" : ""} (will be skipped)`
    default:
      return `Unknown issue: ${issue.kind}`
  }
}

export { isBlockingIssue }
