/**
 * RosterTab - displays course info, roster source, student count, and actions.
 *
 * Button styling logic:
 * - Neither import button is "primary" - they are parallel entry points for different user contexts
 * - "Import from LMS" is disabled when no LMS connection is configured
 * - Other action buttons are disabled when roster is empty
 * - Primary emphasis should be on progressing to next tab, not staying on Roster
 */

import type {
  Roster,
  ValidationIssue,
  ValidationKind,
} from "@repo-edu/backend-interface/types"
import {
  Alert,
  AlertDescription,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo-edu/ui"
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "@repo-edu/ui/components/icons"
import { useState } from "react"
import { commands } from "../../bindings/commands"
import { saveDialog } from "../../services/platform"
import { useAppSettingsStore } from "../../stores/appSettingsStore"
import { useConnectionsStore } from "../../stores/connectionsStore"
import { useOutputStore } from "../../stores/outputStore"
import { selectCourse, useProfileStore } from "../../stores/profileStore"
import { useUiStore } from "../../stores/uiStore"
import { formatDateTime } from "../../utils/formatDate"
import { buildLmsOperationContext } from "../../utils/operationContext"
import { CourseDisplay } from "../CourseDisplay"

/**
 * Human-readable descriptions for validation issue kinds.
 */
const ISSUE_DESCRIPTIONS: Record<
  ValidationKind,
  { title: string; description: string; action?: string }
> = {
  duplicate_student_id: {
    title: "Duplicate student ID",
    description: "Multiple students share the same ID.",
    action: "Edit affected students to use unique IDs.",
  },
  duplicate_email: {
    title: "Duplicate email",
    description: "Multiple students share the same email address.",
    action: "Edit affected students to use unique emails.",
  },
  duplicate_assignment_name: {
    title: "Duplicate assignment name",
    description: "Multiple assignments share the same name.",
    action: "Rename assignments to be unique.",
  },
  duplicate_group_id_in_assignment: {
    title: "Duplicate group ID",
    description: "Multiple groups in an assignment share the same ID.",
    action: "Edit the assignment to fix group IDs.",
  },
  duplicate_group_name_in_assignment: {
    title: "Duplicate group name",
    description: "Multiple groups in an assignment share the same name.",
    action: "Rename groups to be unique.",
  },
  duplicate_repo_name_in_assignment: {
    title: "Duplicate repository name",
    description:
      "Multiple groups would create repositories with the same name.",
    action: "Change group names or the repo naming template.",
  },
  student_in_multiple_groups_in_assignment: {
    title: "Student in multiple groups",
    description: "A student appears in more than one group for an assignment.",
    action: "Remove the student from one of the groups.",
  },
  orphan_group_member: {
    title: "Unknown group member",
    description: "A group references a student ID that doesn't exist.",
    action: "Remove the invalid member or add the missing student.",
  },
  missing_git_username: {
    title: "Missing git username",
    description: "Some students don't have a git username set.",
    action: "Import git usernames or add them manually.",
  },
  invalid_git_username: {
    title: "Invalid git username",
    description: "Some students have git usernames that couldn't be verified.",
    action: "Verify and correct the git usernames.",
  },
  empty_group: {
    title: "Empty group",
    description: "A group has no members assigned.",
    action: "Add members to the group or delete it.",
  },
  missing_email: {
    title: "Missing email",
    description: "Some students don't have an email address.",
    action: "Add email addresses to affected students.",
  },
}

export function RosterTab() {
  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const setRoster = useProfileStore((state) => state.setRoster)
  const rosterValidation = useProfileStore((state) => state.rosterValidation)
  const rosterStatus = useProfileStore((state) => state.status)
  const course = useProfileStore(selectCourse)

  const activeProfile = useUiStore((state) => state.activeProfile)
  const lmsConnection = useAppSettingsStore((state) => state.lmsConnection)
  const courseStatus = useConnectionsStore((state) => state.courseStatus)
  const appendOutput = useOutputStore((state) => state.appendText)

  // Dialog/sheet openers
  const openSettings = useUiStore((state) => state.openSettings)
  const setStudentEditorOpen = useUiStore((state) => state.setStudentEditorOpen)
  const setCoverageReportOpen = useUiStore(
    (state) => state.setCoverageReportOpen,
  )
  const setImportFileDialogOpen = useUiStore(
    (state) => state.setImportFileDialogOpen,
  )
  const setClearRosterDialogOpen = useUiStore(
    (state) => state.setClearRosterDialogOpen,
  )

  const [importing, setImporting] = useState(false)
  const [issuesExpanded, setIssuesExpanded] = useState(false)

  const studentCount = roster?.students.length ?? 0
  const issueCount = rosterValidation?.issues.length ?? 0
  const hasStudents = studentCount > 0
  const hasLmsConnection = lmsConnection !== null
  const lmsContext = buildLmsOperationContext(lmsConnection, course.id)

  // Can import from LMS if:
  // - LMS connection exists
  // - Course ID is set
  // - Course is verified (or we haven't tried yet)
  // - Not currently importing
  const canImportFromLms =
    hasLmsConnection &&
    course.id.trim() !== "" &&
    courseStatus !== "failed" &&
    !importing

  // Tooltip message for disabled LMS import button
  const lmsImportTooltip = !hasLmsConnection
    ? "Configure an LMS connection in Settings first"
    : !course.id.trim()
      ? "No course configured for this profile"
      : courseStatus === "failed"
        ? "Course verification failed - check Settings"
        : importing
          ? "Import in progress..."
          : hasStudents
            ? "Re-import students from LMS"
            : "Import students from LMS"

  const handleImportFromLms = async () => {
    if (!activeProfile || !canImportFromLms || !lmsContext) return

    setImporting(true)
    appendOutput("Importing students from LMS...", "info")

    try {
      const result = await commands.importStudentsFromLms(
        lmsContext,
        roster ?? null,
      )

      if (result.status === "error") {
        appendOutput(`Import failed: ${result.error.message}`, "error")
        return
      }

      const { roster: newRoster, summary } = result.data
      setRoster(newRoster)

      let message = `Imported ${summary.students_added} students (${summary.students_updated} updated, ${summary.students_unchanged} unchanged)`
      if (summary.students_missing_email > 0) {
        message += `. Warning: ${summary.students_missing_email} students missing email`
      }
      appendOutput(message, "success")
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendOutput(`Import failed: ${message}`, "error")
    } finally {
      setImporting(false)
    }
  }

  const handleClear = () => {
    if (!hasStudents) return
    setClearRosterDialogOpen(true)
  }

  const handleExportStudents = async (format: "csv" | "xlsx") => {
    if (!roster) return

    try {
      const path = await saveDialog({
        defaultPath: `students.${format}`,
        filters: [
          {
            name: format === "csv" ? "CSV files" : "Excel files",
            extensions: [format],
          },
        ],
      })

      if (!path) return

      const result = await commands.exportStudents(roster, path)
      if (result.status === "ok") {
        appendOutput(`Students exported to ${path}`, "success")
      } else {
        appendOutput(`Export failed: ${result.error.message}`, "error")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendOutput(`Export failed: ${message}`, "error")
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Course display with verification */}
      <CourseDisplay />

      {/* Roster source - always shown */}
      <RosterSourceDisplay roster={roster} />

      {/* Student count + issues (only when students exist) */}
      {hasStudents && (
        <div>
          <span>{studentCount} students</span>
          {issueCount > 0 && (
            <IssuesIndicator
              issues={rosterValidation?.issues ?? []}
              expanded={issuesExpanded}
              onToggle={() => setIssuesExpanded(!issuesExpanded)}
            />
          )}
        </div>
      )}

      {/* Action buttons - different layout for empty vs populated roster */}
      {hasStudents ? (
        <RosterActions
          canImportFromLms={canImportFromLms}
          lmsImportTooltip={lmsImportTooltip}
          importing={importing}
          onImportFromLms={handleImportFromLms}
          onImportFromFile={() => setImportFileDialogOpen(true)}
          onViewEdit={() => setStudentEditorOpen(true)}
          onCoverage={() => setCoverageReportOpen(true)}
          onExport={handleExportStudents}
          onClear={handleClear}
        />
      ) : (
        <EmptyRosterState
          hasLmsConnection={hasLmsConnection}
          canImportFromLms={canImportFromLms}
          lmsImportTooltip={lmsImportTooltip}
          importing={importing}
          onImportFromLms={handleImportFromLms}
          onImportFromFile={() => setImportFileDialogOpen(true)}
          onAddManually={() => setStudentEditorOpen(true)}
          onOpenSettings={() => openSettings("connections")}
        />
      )}

      {rosterStatus === "loading" && <div>Loading...</div>}
    </div>
  )
}

/**
 * Clickable issues indicator with expandable details.
 */
interface IssuesIndicatorProps {
  issues: ValidationIssue[]
  expanded: boolean
  onToggle: () => void
}

function IssuesIndicator({ issues, expanded, onToggle }: IssuesIndicatorProps) {
  const issueCount = issues.length

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className="text-warning ml-2 hover:underline cursor-pointer"
      >
        {expanded ? (
          <ChevronDown className="inline size-4 align-text-bottom" />
        ) : (
          <ChevronRight className="inline size-4 align-text-bottom" />
        )}{" "}
        {issueCount} issue{issueCount > 1 ? "s" : ""}
      </button>
      {expanded && (
        <Alert variant="warning" className="mt-3">
          <AlertTriangle className="size-4" />
          <AlertDescription>
            <ul className="mt-1 space-y-2">
              {issues.map((issue, index) => {
                const info = ISSUE_DESCRIPTIONS[issue.kind]
                return (
                  <li key={index}>
                    <span className="font-medium">{info.title}:</span>{" "}
                    {info.description}
                    {info.action && (
                      <span className="text-muted-foreground ml-1">
                        {info.action}
                      </span>
                    )}
                    {issue.context && (
                      <span className="text-muted-foreground ml-1">
                        ({issue.context})
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </>
  )
}

/**
 * Empty roster state with guidance based on LMS configuration.
 */
interface EmptyRosterStateProps {
  hasLmsConnection: boolean
  canImportFromLms: boolean
  lmsImportTooltip: string
  importing: boolean
  onImportFromLms: () => void
  onImportFromFile: () => void
  onAddManually: () => void
  onOpenSettings: () => void
}

function EmptyRosterState({
  hasLmsConnection,
  canImportFromLms,
  lmsImportTooltip,
  importing,
  onImportFromLms,
  onImportFromFile,
  onAddManually,
  onOpenSettings,
}: EmptyRosterStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-4 text-center">
      <p className="text-muted-foreground max-w-md">
        {hasLmsConnection
          ? "No students in roster. Import from your LMS or a file."
          : "Import a student roster from a CSV/Excel file, or configure an LMS connection in Settings to import directly."}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onImportFromLms}
          disabled={!canImportFromLms}
          title={lmsImportTooltip}
        >
          {importing ? (
            <>
              <Loader2 className="size-4 mr-1 animate-spin" />
              Importing...
            </>
          ) : (
            "Import from LMS"
          )}
        </Button>
        <Button size="sm" variant="outline" onClick={onImportFromFile}>
          Import from File
        </Button>
        <Button size="sm" variant="outline" onClick={onAddManually}>
          Add Manually
        </Button>
      </div>
      {!hasLmsConnection && (
        <Button variant="link" size="sm" onClick={onOpenSettings}>
          Configure LMS Connection →
        </Button>
      )}
    </div>
  )
}

/**
 * Action buttons for populated roster.
 * All buttons are secondary (outline) - no primary button.
 */
interface RosterActionsProps {
  canImportFromLms: boolean
  lmsImportTooltip: string
  importing: boolean
  onImportFromLms: () => void
  onImportFromFile: () => void
  onViewEdit: () => void
  onCoverage: () => void
  onExport: (format: "csv" | "xlsx") => void
  onClear: () => void
}

function RosterActions({
  canImportFromLms,
  lmsImportTooltip,
  importing,
  onImportFromLms,
  onImportFromFile,
  onViewEdit,
  onCoverage,
  onExport,
  onClear,
}: RosterActionsProps) {
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={onImportFromLms}
        disabled={!canImportFromLms}
        title={lmsImportTooltip}
      >
        {importing ? (
          <>
            <Loader2 className="size-4 mr-1 animate-spin" />
            Importing...
          </>
        ) : (
          "Import from LMS"
        )}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onImportFromFile}
        title="Import roster students from a CSV or Excel file."
      >
        Import Students (File)
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onViewEdit}
        title="View and manually edit student information."
      >
        View/Edit
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onCoverage}
        title="Shows if each student has a valid git account. Green = verified, Yellow = unverified, Red = not found."
      >
        Coverage
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            title="Export the roster student list (names, emails, git usernames). For group round-trip editing, use Assignment → Export → Groups."
          >
            Export
            <ChevronDown className="size-4 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onExport("csv")}>
            Roster Students (CSV)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onExport("xlsx")}>
            Roster Students (XLSX)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        size="sm"
        variant="outline"
        onClick={onClear}
        title="Remove all students, assignments, and git username mappings from this profile."
      >
        Clear
      </Button>
    </div>
  )
}

interface RosterSourceDisplayProps {
  roster: Roster | null
}

function RosterSourceDisplay({ roster }: RosterSourceDisplayProps) {
  const dateFormat = useAppSettingsStore((state) => state.dateFormat)
  const timeFormat = useAppSettingsStore((state) => state.timeFormat)

  if (!roster?.source) {
    return (
      <div>
        <span>Source:</span> <span>None (no roster loaded)</span>
      </div>
    )
  }

  const { source } = roster

  // Determine source label
  let sourceLabel: string
  switch (source.kind) {
    case "lms":
      sourceLabel = "LMS"
      break
    case "file":
      sourceLabel = source.file_name ?? "File"
      break
    case "manual":
      sourceLabel = "Manual entry"
      break
    default:
      sourceLabel = source.kind
  }

  // Get timestamp
  const timestamp = source.fetched_at ?? source.imported_at ?? source.created_at

  return (
    <div>
      <span>Source:</span> <span>{sourceLabel}</span>
      {timestamp && (
        <span className="text-muted-foreground ml-1">
          ({formatDateTime(timestamp, dateFormat, timeFormat)})
        </span>
      )}
    </div>
  )
}
