/**
 * RosterTab - displays course info, roster source, student count, and actions.
 */

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo-edu/ui"
import { ChevronDown, Loader2 } from "@repo-edu/ui/components/icons"
import { useState } from "react"
import { commands } from "../../bindings/commands"
import { useAppSettingsStore } from "../../stores/appSettingsStore"
import { useConnectionsStore } from "../../stores/connectionsStore"
import { useOutputStore } from "../../stores/outputStore"
import { useProfileSettingsStore } from "../../stores/profileSettingsStore"
import { useRosterStore } from "../../stores/rosterStore"
import { useUiStore } from "../../stores/uiStore"
import { CourseDisplay } from "../CourseDisplay"

export function RosterTab() {
  const roster = useRosterStore((state) => state.roster)
  const setRoster = useRosterStore((state) => state.setRoster)
  const rosterValidation = useRosterStore((state) => state.rosterValidation)
  const rosterStatus = useRosterStore((state) => state.status)

  const activeProfile = useUiStore((state) => state.activeProfile)
  const course = useProfileSettingsStore((state) => state.course)
  const lmsConnection = useAppSettingsStore((state) => state.lmsConnection)
  const courseStatus = useConnectionsStore((state) => state.courseStatus)
  const appendOutput = useOutputStore((state) => state.appendText)

  // Dialog/sheet openers
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

  const studentCount = roster?.students.length ?? 0
  const issueCount = rosterValidation?.issues.length ?? 0
  const hasStudents = studentCount > 0

  // Can import from LMS if:
  // - LMS connection exists
  // - Course ID is set
  // - Course is verified (or we haven't tried yet)
  // - Not currently importing
  const canImportFromLms =
    lmsConnection !== null &&
    course.id.trim() !== "" &&
    courseStatus !== "failed" &&
    !importing

  const handleImportFromLms = async () => {
    if (!activeProfile || !canImportFromLms) return

    setImporting(true)
    appendOutput("Importing students from LMS...", "info")

    try {
      const result = await commands.importStudentsFromLms(
        activeProfile,
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
      const { save } = await import("@tauri-apps/plugin-dialog")
      const path = await save({
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
    <div className="flex flex-col gap-4 p-4">
      {/* Course display with verification */}
      <CourseDisplay />

      {/* Roster source - always shown */}
      <RosterSourceDisplay roster={roster} />

      {/* Student count + issues (only when students exist) */}
      {hasStudents && (
        <div className="text-sm">
          <span className="font-medium">{studentCount} students</span>
          {issueCount > 0 && (
            <span className="text-warning ml-2">
              {issueCount} issue{issueCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* Action buttons */}
      {hasStudents ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleImportFromLms}
            disabled={!canImportFromLms}
            title={
              !lmsConnection
                ? "Configure LMS connection first"
                : !course.id.trim()
                  ? "No course configured"
                  : courseStatus === "failed"
                    ? "Course verification failed"
                    : "Re-import students from LMS"
            }
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
            onClick={() => setImportFileDialogOpen(true)}
          >
            Import from File
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setStudentEditorOpen(true)}
          >
            View/Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCoverageReportOpen(true)}
          >
            Coverage
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                Export
                <ChevronDown className="size-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExportStudents("csv")}>
                Students (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportStudents("xlsx")}>
                Students (XLSX)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="outline"
            onClick={handleClear}
            disabled={!hasStudents}
          >
            Clear
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
          <p className="text-muted-foreground">No students in roster</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleImportFromLms}
              disabled={!canImportFromLms}
              title={
                !lmsConnection
                  ? "Configure LMS connection first"
                  : !course.id.trim()
                    ? "No course configured"
                    : courseStatus === "failed"
                      ? "Course verification failed"
                      : "Import students from LMS"
              }
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
              onClick={() => setImportFileDialogOpen(true)}
            >
              Import from File
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStudentEditorOpen(true)}
            >
              Add Student Manually
            </Button>
          </div>
        </div>
      )}

      {rosterStatus === "loading" && (
        <div className="text-sm text-muted-foreground">Loading...</div>
      )}
    </div>
  )
}

interface RosterSourceDisplayProps {
  roster: ReturnType<typeof useRosterStore.getState>["roster"]
}

function RosterSourceDisplay({ roster }: RosterSourceDisplayProps) {
  if (!roster?.source) {
    return (
      <div className="text-sm text-muted-foreground">
        <span className="font-medium">Source:</span> None (no roster loaded)
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
    case "csv":
      sourceLabel = "CSV file"
      break
    case "xlsx":
      sourceLabel = "Excel file"
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
    <div className="text-sm text-muted-foreground">
      <span className="font-medium">Source:</span> {sourceLabel}
      {timestamp && (
        <span className="ml-1">({new Date(timestamp).toLocaleString()})</span>
      )}
    </div>
  )
}
