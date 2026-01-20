/**
 * FileImportExportSheet - Advanced file-based import/export for assignment groups.
 * Consolidates export options and file import with workflow documentation.
 */

import {
  Button,
  Input,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Text,
} from "@repo-edu/ui"
import { Folder } from "@repo-edu/ui/components/icons"
import { useState } from "react"
import { commands } from "../../bindings/commands"
import { openDialog, saveDialog } from "../../services/platform"
import { useOutputStore } from "../../stores/outputStore"
import { useProfileStore } from "../../stores/profileStore"
import { useUiStore } from "../../stores/uiStore"

export function FileImportExportSheet() {
  const open = useUiStore((state) => state.fileImportExportOpen)
  const setOpen = useUiStore((state) => state.setFileImportExportOpen)
  const activeProfile = useUiStore((state) => state.activeProfile)

  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const assignmentSelection = useProfileStore(
    (state) => state.assignmentSelection,
  )
  const selectedAssignmentId =
    assignmentSelection?.mode === "assignment" ? assignmentSelection.id : null
  const setRoster = useProfileStore((state) => state.setRoster)
  const hasStudents = Boolean(roster?.students.length)

  const appendOutput = useOutputStore((state) => state.appendText)

  const [importFilePath, setImportFilePath] = useState("")
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const handleExportGroups = async (format: "csv" | "xlsx") => {
    if (!roster || !selectedAssignmentId) return

    try {
      const path = await saveDialog({
        defaultPath: `assignment-groups.${format}`,
        filters: [
          {
            name: format === "csv" ? "CSV files" : "Excel files",
            extensions: [format],
          },
        ],
      })

      if (!path) return

      const result = await commands.exportGroupsForEdit(
        roster,
        selectedAssignmentId,
        path,
      )
      if (result.status === "ok") {
        appendOutput(`Groups exported to ${path}`, "success")
      } else {
        appendOutput(`Export failed: ${result.error.message}`, "error")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendOutput(`Export failed: ${message}`, "error")
    }
  }

  const handleExportTeams = async () => {
    if (!roster || !selectedAssignmentId) return
    if (!activeProfile) {
      appendOutput("No active profile selected.", "warning")
      return
    }

    try {
      const path = await saveDialog({
        defaultPath: "teams.yaml",
        filters: [
          {
            name: "YAML files",
            extensions: ["yaml", "yml"],
          },
        ],
      })

      if (!path) return

      const result = await commands.exportTeams(
        activeProfile,
        roster,
        selectedAssignmentId,
        path,
      )
      if (result.status === "ok") {
        appendOutput(`Teams exported to ${path}`, "success")
      } else {
        appendOutput(`Export failed: ${result.error.message}`, "error")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendOutput(`Export failed: ${message}`, "error")
    }
  }

  const handleExportAssignmentStudents = async (format: "csv" | "xlsx") => {
    if (!roster || !selectedAssignmentId) return

    try {
      const path = await saveDialog({
        defaultPath: `assignment-students.${format}`,
        filters: [
          {
            name: format === "csv" ? "CSV files" : "Excel files",
            extensions: [format],
          },
        ],
      })

      if (!path) return

      const result = await commands.exportAssignmentStudents(
        roster,
        selectedAssignmentId,
        path,
      )
      if (result.status === "ok") {
        appendOutput(`Assignment students exported to ${path}`, "success")
      } else {
        appendOutput(`Export failed: ${result.error.message}`, "error")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendOutput(`Export failed: ${message}`, "error")
    }
  }

  const handleBrowse = async () => {
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [
          {
            name: "Spreadsheet files",
            extensions: ["csv", "xlsx", "xls"],
          },
        ],
      })
      if (selected && typeof selected === "string") {
        setImportFilePath(selected)
      }
    } catch (browseError) {
      console.error("Failed to open file dialog:", browseError)
    }
  }

  const handleImport = async () => {
    if (!roster || !selectedAssignmentId || !importFilePath) return

    setImporting(true)
    setImportError(null)
    appendOutput("Importing groups from file...", "info")

    try {
      const result = await commands.importGroupsFromFile(
        roster,
        selectedAssignmentId,
        importFilePath,
      )

      if (result.status === "error") {
        setImportError(result.error.message)
        appendOutput(`Import failed: ${result.error.message}`, "error")
        return
      }

      const { roster: newRoster, summary } = result.data
      setRoster(newRoster, "Import groups from file")

      const message =
        `Groups imported: +${summary.groups_added}, ` +
        `-${summary.groups_removed}, ` +
        `${summary.groups_renamed} renamed; ` +
        `members +${summary.members_added}, ` +
        `-${summary.members_removed}, ` +
        `${summary.members_moved} moved`

      appendOutput(message, "success")
      setImportFilePath("")
    } catch (importErr) {
      const message =
        importErr instanceof Error ? importErr.message : String(importErr)
      setImportError(message)
      appendOutput(`Import failed: ${message}`, "error")
    } finally {
      setImporting(false)
    }
  }

  const handleClose = () => {
    setOpen(false)
    setImportFilePath("")
    setImportError(null)
  }

  const assignment = roster?.assignments.find(
    (a) => a.id === selectedAssignmentId,
  )

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col bg-background h-full">
        <SheetHeader>
          <SheetTitle>
            File Import/Export{assignment ? `: ${assignment.name}` : ""}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 flex flex-col gap-6 py-4 overflow-y-auto">
          {/* Workflow explanation */}
          <section>
            <h4 className="font-medium mb-2">Round-Trip Editing Workflow</h4>
            <Text variant="muted" className="text-sm">
              1. <strong>Export</strong> groups to CSV or Excel
              <br />
              2. <strong>Edit</strong> the file in your spreadsheet application
              <br />
              3. <strong>Import</strong> the modified file back
            </Text>
            <Text variant="muted" className="text-sm mt-2">
              The group_id column enables round-trip editing. Rows with matching
              group_id update existing groups; rows without group_id create new
              groups.
            </Text>
          </section>

          {/* Export section */}
          <section>
            <h4 className="font-medium mb-2">Export</h4>
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleExportGroups("csv")}
                  disabled={!selectedAssignmentId}
                >
                  Groups (CSV)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleExportGroups("xlsx")}
                  disabled={!selectedAssignmentId}
                >
                  Groups (XLSX)
                </Button>
              </div>
              <Text variant="muted" className="text-xs">
                Editable format with group_id, group_name, student_id,
                student_email columns.
              </Text>

              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportTeams}
                  disabled={!selectedAssignmentId}
                >
                  Teams (YAML)
                </Button>
              </div>
              <Text variant="muted" className="text-xs">
                RepoBee-compatible teams format for repository operations.
              </Text>

              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleExportAssignmentStudents("csv")}
                  disabled={!selectedAssignmentId}
                >
                  Students (CSV)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleExportAssignmentStudents("xlsx")}
                  disabled={!selectedAssignmentId}
                >
                  Students (XLSX)
                </Button>
              </div>
              <Text variant="muted" className="text-xs">
                Students assigned to this assignment with their group
                membership.
              </Text>
            </div>
          </section>

          {/* Import section */}
          <section>
            <h4 className="font-medium mb-2">Import from File</h4>

            {importError && (
              <Text className="text-destructive text-sm mb-2">
                {importError}
              </Text>
            )}

            {!hasStudents && (
              <Text className="text-warning text-sm mb-2">
                No students loaded. Import students first in the Roster tab so
                groups can match by student_id/email.
              </Text>
            )}

            <div className="flex gap-2 mb-2">
              <Input
                placeholder="Select file..."
                value={importFilePath}
                readOnly
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={handleBrowse}>
                <Folder className="size-4 mr-1" />
                Browse
              </Button>
            </div>

            <Button
              size="sm"
              onClick={handleImport}
              disabled={
                !importFilePath ||
                importing ||
                !selectedAssignmentId ||
                !hasStudents
              }
            >
              {importing ? "Importing..." : "Import"}
            </Button>

            <div className="mt-3 text-sm">
              <p className="font-medium text-xs">Expected columns:</p>
              <Text variant="muted" className="text-xs">
                Round-trip: group_id, group_name, student_id, student_email
                <br />
                New groups: group_name, student_email (student_id optional)
              </Text>
            </div>
          </section>
        </div>

        <SheetFooter className="border-t pt-4">
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
