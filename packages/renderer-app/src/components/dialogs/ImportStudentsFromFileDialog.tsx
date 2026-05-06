import { courseHasRoster } from "@repo-edu/domain/types"
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
import { useCourseStore } from "../../stores/course-store.js"
import { useUiStore } from "../../stores/ui-store.js"
import { getErrorMessage } from "../../utils/error-message.js"

export function ImportStudentsFromFileDialog() {
  const importFileDialogOpen = useUiStore((state) => state.importFileDialogOpen)
  const setImportFileDialogOpen = useUiStore(
    (state) => state.setImportFileDialogOpen,
  )

  const setRoster = useCourseStore((state) => state.setRoster)
  const setIdSequences = useCourseStore((state) => state.setIdSequences)
  const course = useCourseStore((state) => state.course)

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
    if (!course) {
      setError("No course loaded")
      return
    }
    if (!courseHasRoster(course)) {
      setError("RepoBee courses do not support roster imports")
      return
    }

    setImporting(true)
    setError(null)

    try {
      const client = getWorkflowClient()
      const imported = await client.run("roster.importFromFile", {
        course,
        file: fileRef,
      })
      setRoster(imported.roster, "Import students from file")
      setIdSequences(imported.idSequences)
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
              email, student_number, git_username, status, role
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
            Existing students are matched by email or student number. New
            students are added with local IDs.
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
