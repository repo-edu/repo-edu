/**
 * ImportGroupsFromFileDialog - Import assignment groups from CSV or Excel file
 */

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Text,
} from "@repo-edu/ui"
import { Folder } from "@repo-edu/ui/components/icons"
import { useState } from "react"
import { commands } from "../../bindings/commands"
import { openDialog } from "../../services/platform"
import { useOutputStore } from "../../stores/outputStore"
import { useProfileStore } from "../../stores/profileStore"
import { useUiStore } from "../../stores/uiStore"

export function ImportGroupsFromFileDialog() {
  const open = useUiStore((state) => state.importGroupsFromFileDialogOpen)
  const setOpen = useUiStore((state) => state.setImportGroupsFromFileDialogOpen)

  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const assignmentSelection = useProfileStore(
    (state) => state.assignmentSelection,
  )
  const selectedAssignmentId =
    assignmentSelection?.mode === "assignment" ? assignmentSelection.id : null
  const setRoster = useProfileStore((state) => state.setRoster)
  const hasStudents = Boolean(roster?.students.length)

  const appendOutput = useOutputStore((state) => state.appendText)

  const [filePath, setFilePath] = useState("")
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        setFilePath(selected)
      }
    } catch (browseError) {
      console.error("Failed to open file dialog:", browseError)
    }
  }

  const handleImport = async () => {
    if (!roster || !selectedAssignmentId || !filePath) return

    setImporting(true)
    setError(null)
    appendOutput("Importing groups from file...", "info")

    try {
      const result = await commands.importGroupsFromFile(
        roster,
        selectedAssignmentId,
        filePath,
      )

      if (result.status === "error") {
        setError(result.error.message)
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
      handleClose()
    } catch (importError) {
      const message =
        importError instanceof Error ? importError.message : String(importError)
      setError(message)
      appendOutput(`Import failed: ${message}`, "error")
    } finally {
      setImporting(false)
    }
  }

  const handleClose = () => {
    setOpen(false)
    setFilePath("")
    setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Groups from File</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {error && <Text className="text-destructive">{error}</Text>}
          {!hasStudents && (
            <Text className="text-warning">
              No students loaded. Import students first in the Roster tab so
              groups can match by student_id/email.
            </Text>
          )}

          <Text variant="muted">
            Import groups that were edited externally (CSV/XLSX). Student
            matching uses student_id first, then student_email. Conflicts stop
            the import and external edits clear the LMS link.
          </Text>
          <Text variant="muted">
            If your file includes group_id, we treat it as a round-trip edit.
            Without group_id, we create new groups from group_name.
          </Text>

          <div className="text-sm">
            <p className="font-medium">Round-trip columns:</p>
            <p className="text-muted-foreground">
              group_id, group_name, student_id, student_email
            </p>
          </div>
          <div className="text-sm">
            <p className="font-medium">First-time columns:</p>
            <p className="text-muted-foreground">
              group_name, student_email (student_id optional)
            </p>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Select file..."
              value={filePath}
              readOnly
              className="flex-1"
            />
            <Button variant="outline" onClick={handleBrowse}>
              <Folder className="size-4 mr-1" />
              Browse
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={
              !filePath || importing || !selectedAssignmentId || !hasStudents
            }
          >
            {importing ? "Importing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
