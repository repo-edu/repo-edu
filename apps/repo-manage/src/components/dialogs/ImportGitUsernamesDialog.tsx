/**
 * ImportGitUsernamesDialog - Import git usernames from CSV file
 *
 * Only relevant when using "Username" identity mode. In "Email" mode,
 * git identities are matched by email address.
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
import { useState } from "react"
import { commands } from "../../bindings/commands"
import { useOutputStore } from "../../stores/outputStore"
import { useRosterStore } from "../../stores/rosterStore"
import { useUiStore } from "../../stores/uiStore"

export function ImportGitUsernamesDialog() {
  const importGitUsernamesDialogOpen = useUiStore(
    (state) => state.importGitUsernamesDialogOpen,
  )
  const setImportGitUsernamesDialogOpen = useUiStore(
    (state) => state.setImportGitUsernamesDialogOpen,
  )
  const setGitUsernameImportResult = useUiStore(
    (state) => state.setGitUsernameImportResult,
  )
  const activeProfile = useUiStore((state) => state.activeProfile)

  const roster = useRosterStore((state) => state.roster)
  const setRoster = useRosterStore((state) => state.setRoster)

  const appendOutput = useOutputStore((state) => state.appendText)

  const [filePath, setFilePath] = useState("")
  const [importing, setImporting] = useState(false)

  const handleBrowse = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog")
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "CSV files",
            extensions: ["csv"],
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
    if (!activeProfile || !roster || !filePath) return

    setImporting(true)
    appendOutput("Importing git usernames...", "info")

    try {
      const result = await commands.importGitUsernames(
        activeProfile,
        roster,
        filePath,
      )

      if (result.status === "error") {
        appendOutput(`Import failed: ${result.error.message}`, "error")
        return
      }

      const { roster: newRoster, summary } = result.data
      setRoster(newRoster)
      setGitUsernameImportResult(result.data)

      let message = `Matched ${summary.matched} git usernames`
      if (summary.unmatched_emails.length > 0) {
        message += ` (${summary.unmatched_emails.length} emails not found in roster)`
      }
      appendOutput(
        message,
        summary.unmatched_emails.length > 0 ? "warning" : "success",
      )

      // Close dialog on success
      setImportGitUsernamesDialogOpen(false)
      setFilePath("")
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendOutput(`Import failed: ${message}`, "error")
    } finally {
      setImporting(false)
    }
  }

  const handleClose = () => {
    setImportGitUsernamesDialogOpen(false)
    setFilePath("")
  }

  const hasStudents = roster && roster.students.length > 0

  return (
    <Dialog
      open={importGitUsernamesDialogOpen}
      onOpenChange={setImportGitUsernamesDialogOpen}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Git Usernames</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {!hasStudents ? (
            <p className="text-sm text-muted-foreground">
              Import students first before importing git usernames.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Import git usernames from a CSV file to map students to their
                git platform accounts.
              </p>

              <div className="text-sm">
                <p className="font-medium">Required columns:</p>
                <p className="text-muted-foreground">email, git_username</p>
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Select CSV file..."
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
                Students are matched by email. Unmatched emails will be skipped.
              </p>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!filePath || importing || !hasStudents}
          >
            {importing ? "Importing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
