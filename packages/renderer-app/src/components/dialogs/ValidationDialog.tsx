import type {
  RosterValidationIssue,
  RosterValidationKind,
} from "@repo-edu/domain/types"
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
import { useOperationStore } from "../../stores/operation-store.js"
import { useUiStore } from "../../stores/ui-store.js"

const BLOCKING_KINDS: Set<RosterValidationKind> = new Set([
  "duplicate_student_id",
  "duplicate_email",
  "invalid_email",
  "duplicate_assignment_name",
  "duplicate_group_id_in_assignment",
  "duplicate_group_name_in_assignment",
  "duplicate_repo_name_in_assignment",
  "orphan_group_member",
  "empty_group",
  "unassigned_student",
])

function isBlockingIssue(kind: RosterValidationKind): boolean {
  return BLOCKING_KINDS.has(kind)
}

type ValidationDialogProps = {
  onProceed?: () => void
}

export function ValidationDialog({ onProceed }: ValidationDialogProps) {
  const open = useUiStore((state) => state.validationDialogOpen)
  const setOpen = useUiStore((state) => state.setValidationDialogOpen)
  const validationResult = useOperationStore((state) => state.validationResult)

  if (!validationResult) return null

  const issues = validationResult.issues
  const blockingIssues = issues.filter((issue) => isBlockingIssue(issue.kind))
  const warningIssues = issues.filter((issue) => !isBlockingIssue(issue.kind))
  const hasBlocking = blockingIssues.length > 0

  const handleProceed = () => {
    setOpen(false)
    onProceed?.()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle
              className={`size-5 ${hasBlocking ? "text-destructive" : "text-warning"}`}
            />
            {hasBlocking ? "Cannot Proceed" : "Validation Warnings"}
          </DialogTitle>
          <DialogDescription>
            {hasBlocking
              ? "Fix blocking issues before running repository operations."
              : "You can continue, but warnings may affect operation results."}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 overflow-y-auto py-2 space-y-4">
          {blockingIssues.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-sm font-medium text-destructive">
                Errors ({blockingIssues.length})
              </h4>
              <IssueList issues={blockingIssues} variant="error" />
            </div>
          )}
          {warningIssues.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-sm font-medium text-warning">
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

function IssueList({
  issues,
  variant,
}: {
  issues: RosterValidationIssue[]
  variant: "error" | "warning"
}) {
  const iconClass = variant === "error" ? "text-destructive" : "text-warning"
  const keyedIssues = withStableKeys(issues, (issue) => {
    const affectedIds = [...issue.affectedIds].sort().join(",")
    return `${issue.kind}:${issue.context ?? "none"}:${affectedIds}`
  })

  return (
    <ul className="space-y-1.5 text-sm">
      {keyedIssues.map(({ item: issue, key }) => (
        <li key={key} className="flex gap-2">
          <span className={iconClass}>{variant === "error" ? "✗" : "⚠"}</span>
          <span>{formatIssue(issue)}</span>
        </li>
      ))}
    </ul>
  )
}

function withStableKeys<T>(
  items: T[],
  signatureFor: (item: T) => string,
): Array<{ item: T; key: string }> {
  const seenCounts = new Map<string, number>()

  return items.map((item) => {
    const signature = signatureFor(item)
    const seenCount = seenCounts.get(signature) ?? 0
    seenCounts.set(signature, seenCount + 1)

    return {
      item,
      key: seenCount === 0 ? signature : `${signature}:${seenCount + 1}`,
    }
  })
}

function formatIssue(issue: RosterValidationIssue): string {
  const count = issue.affectedIds.length
  const context = issue.context

  switch (issue.kind) {
    case "duplicate_student_id":
      return `Duplicate student ID: ${context ?? "unknown"} (${count} students)`
    case "duplicate_email":
      return `Duplicate email: ${context ?? "unknown"} (${count} students)`
    case "duplicate_assignment_name":
      return `Duplicate assignment name: ${context ?? "unknown"}`
    case "invalid_email":
      return `${count} invalid email${count === 1 ? "" : "s"}`
    case "missing_email":
      return `${count} missing email${count === 1 ? "" : "s"}`
    case "duplicate_group_id_in_assignment":
      return `Duplicate group ID in assignment (${count} groups)`
    case "duplicate_group_name_in_assignment":
      return `Duplicate group name: ${context ?? "unknown"} (${count} groups)`
    case "duplicate_repo_name_in_assignment":
      return `Duplicate repo name: ${context ?? "unknown"} (${count} groups)`
    case "student_in_multiple_groups_in_assignment":
      return `${count} student${count === 1 ? "" : "s"} in multiple groups`
    case "orphan_group_member":
      return `${count} group member reference${count === 1 ? "" : "s"} unknown student${count === 1 ? "" : "s"}`
    case "missing_git_username":
      return `${count} student${count === 1 ? "" : "s"} missing Git username`
    case "invalid_git_username":
      return `${count} student${count === 1 ? "" : "s"} with invalid Git username`
    case "empty_group":
      return `${count} empty group${count === 1 ? "" : "s"}`
    case "unassigned_student":
      return `${count} unassigned student${count === 1 ? "" : "s"}`
    case "system_group_sets_missing":
      return "System group sets are missing."
    case "invalid_enrollment_partition":
      return "Roster enrollment partition is invalid."
    case "invalid_group_origin":
      return "One or more groups have an invalid origin."
    default:
      return `Unknown issue: ${issue.kind}`
  }
}

export { isBlockingIssue }
