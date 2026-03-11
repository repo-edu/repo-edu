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
import { Folder, Loader2 } from "@repo-edu/ui/components/icons"
import { useState } from "react"
import { getRendererHost } from "../../contexts/renderer-host.js"
import { getWorkflowClient } from "../../contexts/workflow-client.js"
import { useAppSettingsStore } from "../../stores/app-settings-store.js"
import { useProfileStore } from "../../stores/profile-store.js"
import { useUiStore } from "../../stores/ui-store.js"
import { getErrorMessage } from "../../utils/error-message.js"

export function ImportGitUsernamesDialog() {
  const open = useUiStore((state) => state.importGitUsernamesDialogOpen)
  const setOpen = useUiStore((state) => state.setImportGitUsernamesDialogOpen)
  const profile = useProfileStore((state) => state.profile)
  const appSettings = useAppSettingsStore((state) => state.settings)
  const setRoster = useProfileStore((state) => state.setRoster)

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

  const hasStudents = (profile?.roster.students.length ?? 0) > 0

  const handleBrowse = async () => {
    try {
      const host = getRendererHost()
      const file = await host.pickUserFile({
        title: "Select Git username CSV",
        acceptFormats: ["csv"],
      })
      if (!file) return
      setFileRef(file)
      setFileName(file.displayName)
      setError(null)
    } catch (cause) {
      const message = getErrorMessage(cause)
      setError(message)
    }
  }

  const handleImport = async () => {
    if (!fileRef || !profile) return

    setImporting(true)
    setError(null)

    try {
      const client = getWorkflowClient()
      const importedRoster = await client.run("gitUsernames.import", {
        profile,
        appSettings,
        file: fileRef,
      })
      setRoster(importedRoster, "Import git usernames")
      handleClose()
    } catch (cause) {
      const message = getErrorMessage(cause)
      setError(message)
    } finally {
      setImporting(false)
    }
  }

  const handleClose = () => {
    setOpen(false)
    setFileName("")
    setFileRef(null)
    setError(null)
    setImporting(false)
  }

  const canImport = fileRef !== null && !importing && hasStudents

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Git Usernames</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-3">
          {!hasStudents ? (
            <Text className="text-sm text-muted-foreground">
              Import students first before importing Git usernames.
            </Text>
          ) : (
            <>
              <Text className="text-sm text-muted-foreground">
                Import a CSV with `email` and `git_username` columns. Matching
                is performed by email.
              </Text>
              <div className="flex gap-2">
                <Input
                  value={fileName}
                  placeholder="Select CSV file..."
                  readOnly
                  className="flex-1"
                />
                <Button variant="outline" onClick={() => void handleBrowse()}>
                  <Folder className="size-4 mr-1" />
                  Browse
                </Button>
              </div>
            </>
          )}

          {error && <Text className="text-sm text-destructive">{error}</Text>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleImport()} disabled={!canImport}>
            {importing ? (
              <>
                <Loader2 className="size-4 mr-1 animate-spin" />
                Importing...
              </>
            ) : (
              "Import"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
