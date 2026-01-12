/**
 * ImportStudentsFromFileDialog - Import students from CSV or Excel file
 */

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@repo-edu/ui"
import { Folder } from "@repo-edu/ui/components/icons"
import { open } from "@tauri-apps/plugin-dialog"
import { useState } from "react"
import { commands } from "../../bindings/commands"
import { useOutputStore } from "../../stores/outputStore"
import { useRosterStore } from "../../stores/rosterStore"
import { useUiStore } from "../../stores/uiStore"

export function ImportStudentsFromFileDialog() {
  const importFileDialogOpen = useUiStore((state) => state.importFileDialogOpen)
  const setImportFileDialogOpen = useUiStore(
    (state) => state.setImportFileDialogOpen,
  )
  const activeProfile = useUiStore((state) => state.activeProfile)

  const roster = useRosterStore((state) => state.roster)
  const setRoster = useRosterStore((state) => state.setRoster)

  const appendOutput = useOutputStore((state) => state.appendText)

  const [filePath, setFilePath] = useState<string>("")
  const [importing, setImporting] = useState(false)

  const handleBrowse = async () => {
    try {
      const selected = await open({
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
    } catch (error) {
      console.error("Failed to open file dialog:", error)
    }
  }

  const handleImport = async () => {
    if (!activeProfile || !filePath) return

    setImporting(true)
    appendOutput("Importing students from file...", "info")

    try {
      const result = await commands.importStudentsFromFile(
        activeProfile,
        roster ?? null,
        filePath,
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

      // Close dialog on success
      setImportFileDialogOpen(false)
      setFilePath("")
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendOutput(`Import failed: ${message}`, "error")
    } finally {
      setImporting(false)
    }
  }

  const handleClose = () => {
    setImportFileDialogOpen(false)
    setFilePath("")
  }

  return (
    <Dialog open={importFileDialogOpen} onOpenChange={setImportFileDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Students</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <p className="text-sm text-muted-foreground">
            Import students from CSV or Excel file.
          </p>

          <div className="text-sm">
            <p className="font-medium">Required columns:</p>
            <p className="text-muted-foreground">name, email</p>
          </div>

          <div className="text-sm">
            <p className="font-medium">Optional columns:</p>
            <p className="text-muted-foreground">
              student_number, git_username
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

          <p className="text-sm text-muted-foreground">
            Existing students matched by email will be updated. New students
            will be added.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!filePath || importing}>
            {importing ? "Importing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
