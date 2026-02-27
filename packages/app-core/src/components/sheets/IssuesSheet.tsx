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
import {
  AlertTriangle,
  ChevronDown,
  Layers,
  Users,
} from "@repo-edu/ui/components/icons"
import { useState } from "react"
import { type IssueCard, useIssues } from "../../hooks/useIssues"
import { useProfileStore } from "../../stores/profileStore"
import { useUiStore } from "../../stores/uiStore"

export function IssuesSheet() {
  const open = useUiStore((state) => state.issuesPanelOpen)
  const setOpen = useUiStore((state) => state.setIssuesPanelOpen)
  const setActiveTab = useUiStore((state) => state.setActiveTab)
  const setSidebarSelection = useUiStore((state) => state.setSidebarSelection)
  const selectAssignment = useProfileStore((state) => state.selectAssignment)

  const { issueCards, rosterInsights, checksStatus, checksError, checksDirty } =
    useIssues()
  const [rosterOpen, setRosterOpen] = useState(true)

  const totalIssues = issueCards.length

  const navigateToGroupSet = (issue: IssueCard) => {
    setActiveTab("groups-assignments")
    if (issue.groupSetId) {
      setSidebarSelection({ kind: "group-set", id: issue.groupSetId })
    }
    if (issue.assignmentId) {
      selectAssignment(issue.assignmentId)
    }
    setOpen(false)
  }

  const handleIssueAction = (issue: IssueCard) => {
    if (issue.kind === "unknown_students" && issue.groupSetId) {
      navigateToGroupSet(issue)
      return
    }

    if (issue.kind === "empty_groups" && issue.groupSetId) {
      navigateToGroupSet(issue)
      return
    }

    if (issue.kind === "roster_validation") {
      if (issue.issueKind === "duplicate_assignment_name") {
        setActiveTab("groups-assignments")
      } else {
        setActiveTab("roster")
      }
      setOpen(false)
      return
    }

    if (issue.kind === "assignment_validation" && issue.assignmentId) {
      navigateToGroupSet(issue)
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
            {checksDirty && checksStatus !== "running" && (
              <div className="text-xs text-muted-foreground">
                Checks are out of date. Close and reopen Issues to refresh.
              </div>
            )}
            {checksStatus === "error" && checksError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {checksError}
              </div>
            )}
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
          {issue.emptyGroupNames && issue.groupSetName && (
            <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-muted-foreground">
              {issue.emptyGroupNames.map((name, i, arr) => (
                <span key={name} className="inline-flex items-center gap-0.5">
                  <Users className="size-2.5" />
                  {name}
                  {i < arr.length - 1 && ","}
                </span>
              ))}
              <span>in</span>
              <span className="inline-flex items-center gap-0.5">
                <Layers className="size-2.5" />
                {issue.groupSetName}
              </span>
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
    case "empty_groups":
    case "assignment_validation":
      return "View groups"
    case "roster_validation":
      return issue.issueKind === "duplicate_assignment_name"
        ? "View assignments"
        : "View roster"
    default:
      return "View"
  }
}
