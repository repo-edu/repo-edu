import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@repo-edu/ui"
import { AlertTriangle, ChevronDown } from "@repo-edu/ui/components/icons"
import { useState } from "react"
import { type IssueCard, useIssues } from "../../hooks/useIssues"
import { useProfileStore } from "../../stores/profileStore"
import { useToastStore } from "../../stores/toastStore"
import { useUiStore } from "../../stores/uiStore"

export function IssuesSheet() {
  const open = useUiStore((state) => state.issuesPanelOpen)
  const setOpen = useUiStore((state) => state.setIssuesPanelOpen)
  const setActiveTab = useUiStore((state) => state.setActiveTab)
  const selectAssignment = useProfileStore((state) => state.selectAssignment)
  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const addToast = useToastStore((state) => state.addToast)

  const { issueCards, rosterInsights } = useIssues()
  const [rosterOpen, setRosterOpen] = useState(true)

  const totalIssues = issueCards.length

  const handleIssueAction = (issue: IssueCard) => {
    const assignmentName = issue.assignmentId
      ? roster?.assignments.find((a) => a.id === issue.assignmentId)?.name
      : null

    const showToast = (message: string) =>
      addToast(message, { tone: "info", durationMs: 3000 })

    if (issue.kind === "unknown_students" && issue.assignmentId) {
      setActiveTab("groups-assignments")
      selectAssignment(issue.assignmentId)
      showToast(
        `Showing groups${assignmentName ? ` in ${assignmentName}` : ""} (search for unknown students)`,
      )
      setOpen(false)
      return
    }

    if (issue.kind === "empty_groups" && issue.assignmentId) {
      setActiveTab("groups-assignments")
      selectAssignment(issue.assignmentId)
      showToast(
        `Showing groups${assignmentName ? ` in ${assignmentName}` : ""} (look for empty groups)`,
      )
      setOpen(false)
      return
    }

    if (issue.kind === "roster_validation") {
      if (issue.issueKind === "duplicate_assignment_name") {
        setActiveTab("groups-assignments")
        showToast("Showing assignments")
      } else {
        setActiveTab("roster")
        showToast("Showing roster issues")
      }
      setOpen(false)
      return
    }

    if (issue.kind === "assignment_validation" && issue.assignmentId) {
      setActiveTab("groups-assignments")
      selectAssignment(issue.assignmentId)
      showToast(
        `Showing groups${assignmentName ? ` in ${assignmentName}` : ""}`,
      )
      setOpen(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="w-full sm:max-w-2xl bg-background">
        <SheetHeader>
          <SheetTitle>Issues</SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-5">
          <section className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Issues ({totalIssues})
            </div>
            {issueCards.length === 0 ? (
              <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
                No issues detected.
              </div>
            ) : (
              <div className="space-y-2">
                {issueCards.map((issue) => (
                  <IssueCardRow
                    key={issue.id}
                    issue={issue}
                    onAction={() => handleIssueAction(issue)}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <Collapsible open={rosterOpen} onOpenChange={setRosterOpen}>
              <CollapsibleTrigger className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Roster Insights</span>
                <ChevronDown
                  className={`size-4 transition-transform ${
                    rosterOpen ? "rotate-0" : "-rotate-90"
                  }`}
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2 text-sm">
                {rosterInsights ? (
                  <>
                    <div>
                      {rosterInsights.activeCount} active ·{" "}
                      {rosterInsights.droppedCount} dropped ·{" "}
                      {rosterInsights.incompleteCount} incomplete
                    </div>
                    <div className="text-muted-foreground">
                      {rosterInsights.missingEmailCount} missing email
                      {rosterInsights.missingGitUsernameCount > 0
                        ? ` · ${rosterInsights.missingGitUsernameCount} missing git usernames`
                        : ""}
                    </div>
                  </>
                ) : (
                  <div className="text-muted-foreground">No roster loaded.</div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function IssueCardRow({
  issue,
  onAction,
}: {
  issue: IssueCard
  onAction: () => void
}) {
  const actionLabel = getIssueActionLabel(issue)
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 text-warning" />
        <div className="flex-1 space-y-1">
          <div className="font-medium text-sm">{issue.title}</div>
          {issue.description && (
            <div className="text-xs text-muted-foreground">
              {issue.description}
            </div>
          )}
          {issue.details && (
            <ul className="text-xs text-muted-foreground">
              {issue.details.map((detail, index) => (
                <li key={index}>{detail}</li>
              ))}
            </ul>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={onAction}>
          {actionLabel}
        </Button>
      </div>
    </div>
  )
}

const getIssueActionLabel = (issue: IssueCard) => {
  switch (issue.kind) {
    case "unknown_students":
      return "View unknown"
    case "empty_groups":
      return "View empty"
    case "roster_validation":
      return issue.issueKind === "duplicate_assignment_name"
        ? "View assignments"
        : "View roster"
    case "assignment_validation":
      return "View groups"
    default:
      return "View"
  }
}
