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
import { getRendererHost } from "../../contexts/renderer-host.js"
import { getWorkflowClient } from "../../contexts/workflow-client.js"
import {
  selectRoster,
  useProfileStore,
} from "../../stores/profile-store.js"
import { useUiStore } from "../../stores/ui-store.js"
import { getErrorMessage } from "../../utils/error-message.js"

export function ImportStudentsFromFileDialog() {
  const importFileDialogOpen = useUiStore((state) => state.importFileDialogOpen)
  const setImportFileDialogOpen = useUiStore(
    (state) => state.setImportFileDialogOpen,
  )

  const setRoster = useProfileStore((state) => state.setRoster)
  const currentRoster = useProfileStore(selectRoster)

  const [fileName, setFileName] = useState("")
  const [fileRef, setFileRef] = useState<{
    kind: "user-file-ref"
    referenceId: string
    displayName: string
    mediaType: string | null
    byteLength: number | null
  } | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleBrowse = async () => {
    try {
      const host = getRendererHost()
      const ref = await host.pickUserFile({
        title: "Select file to import",
        acceptFormats: ["csv", "xlsx"],
      })
      if (ref) {
        setFileRef(ref)
        setFileName(ref.displayName)
      }
    } catch (err) {
      console.error("Failed to open file dialog:", err)
    }
  }

  const handleImport = async () => {
    if (!fileRef) return

    setImporting(true)
    setError(null)

    try {
      const client = getWorkflowClient()
      const newRoster = await client.run("roster.importFromFile", {
        file: fileRef,
      })
      // Preserve existing groups, group sets, and assignments
      // (roster import only updates members and connection)
      if (currentRoster) {
        newRoster.groups = currentRoster.groups
        newRoster.groupSets = currentRoster.groupSets
        newRoster.assignments = currentRoster.assignments
      }
      setRoster(newRoster, "Import students from file")
      setImportFileDialogOpen(false)
      setFileName("")
      setFileRef(null)
    } catch (err) {
      const message = getErrorMessage(err)
      setError(message)
    } finally {
      setImporting(false)
    }
  }

  const handleClose = () => {
    setImportFileDialogOpen(false)
    setFileName("")
    setFileRef(null)
    setError(null)
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
            <p className="text-muted-foreground">name</p>
          </div>

          <div className="text-sm">
            <p className="font-medium">Optional columns:</p>
            <p className="text-muted-foreground">
              id, email, student_number, git_username, status, role
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Input
              placeholder="Select file..."
              value={fileName}
              readOnly
              className="flex-1"
            />
            <Button variant="outline" onClick={handleBrowse}>
              <Folder className="size-4 mr-1" />
              Browse
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            Existing students matched by id, email, or student number will be
            updated. New students will be added.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!fileRef || importing}>
            {importing ? "Importing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
