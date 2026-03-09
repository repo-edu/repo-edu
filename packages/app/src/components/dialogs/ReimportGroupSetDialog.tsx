import type { GroupSetImportPreview } from "@repo-edu/domain"
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  Text,
} from "@repo-edu/ui"
import { AlertTriangle, Folder } from "@repo-edu/ui/components/icons"
import { useState } from "react"
import { getRendererHost } from "../../contexts/renderer-host.js"
import { getWorkflowClient } from "../../contexts/workflow-client.js"
import {
  selectGroupSetById,
  useProfileStore,
} from "../../stores/profile-store.js"
import { useToastStore } from "../../stores/toast-store.js"
import { useUiStore } from "../../stores/ui-store.js"
import { getErrorMessage } from "../../utils/error-message.js"

export function ReimportGroupSetDialog() {
  const [fileName, setFileName] = useState("")
  const [preview, setPreview] = useState<GroupSetImportPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const targetId = useUiStore((state) => state.reimportGroupSetTargetId)
  const setTargetId = useUiStore((state) => state.setReimportGroupSetTargetId)
  const setGroupSetOperation = useUiStore((state) => state.setGroupSetOperation)
  const activeProfileId = useUiStore((state) => state.activeProfileId)
  const open = targetId !== null
  const groupSet = useProfileStore(selectGroupSetById(targetId ?? ""))
  const addToast = useToastStore((state) => state.addToast)

  const handleBrowse = async () => {
    if (!targetId || !activeProfileId) return

    try {
      const host = getRendererHost()
      const fileRef = await host.pickUserFile({
        title: "Select CSV file for import",
        acceptFormats: ["csv"],
      })
      if (!fileRef) return

      setFileName(fileRef.displayName)
      setError(null)
      setLoading(true)

      const client = getWorkflowClient()
      const result = await client.run("groupSet.previewReimportFromFile", {
        profileId: activeProfileId,
        groupSetId: targetId,
        file: fileRef,
      })
      if (result.mode === "reimport") {
        setPreview(result)
      } else {
        setError("Unexpected preview mode")
        setPreview(null)
      }
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  const canImport = preview !== null && !importing

  const handleReimport = async () => {
    if (!canImport || !targetId) return
    setImporting(true)
    setError(null)
    setGroupSetOperation({ kind: "reimport", groupSetId: targetId })

    try {
      const groupSetName = groupSet?.name ?? targetId
      addToast(`Imported "${groupSetName}"`, { tone: "success" })
      handleClose()
    } catch (e) {
      const message = getErrorMessage(e)
      setError(message)
      addToast(`Import failed: ${message}`, { tone: "error" })
    } finally {
      setImporting(false)
      setGroupSetOperation(null)
    }
  }

  const handleClose = () => {
    setTargetId(null)
    setGroupSetOperation(null)
    setFileName("")
    setPreview(null)
    setLoading(false)
    setImporting(false)
    setError(null)
  }

  const hasChanges =
    preview &&
    preview.mode === "reimport" &&
    (preview.addedGroupNames.length > 0 ||
      preview.removedGroupNames.length > 0 ||
      preview.updatedGroupNames.length > 0)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import: {groupSet?.name ?? "Group Set"}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <Text className="text-sm whitespace-pre-wrap">{error}</Text>
            </Alert>
          )}

          <Alert>
            <AlertTriangle className="size-4" />
            <Text className="text-sm">
              This will overwrite the current groups in this set.
            </Text>
          </Alert>

          <Text className="text-xs text-muted-foreground">
            If the CSV includes group_id, matching uses IDs. If not, matching
            falls back to group name, so renames appear as remove + add.
          </Text>

          <FormField label="CSV File">
            <div className="flex gap-2">
              <Input
                value={fileName}
                readOnly
                placeholder="No file selected"
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleBrowse}
                disabled={loading}
              >
                <Folder className="size-4 mr-1.5" />
                Browse
              </Button>
            </div>
          </FormField>

          {loading && (
            <Text className="text-sm text-muted-foreground">
              Loading preview...
            </Text>
          )}

          {preview && preview.mode === "reimport" && (
            <div className="space-y-3">
              <Text className="text-sm font-medium">Changes</Text>

              {!hasChanges && (
                <Text className="text-sm text-muted-foreground">
                  No changes detected.
                </Text>
              )}

              {preview.addedGroupNames.length > 0 && (
                <div className="space-y-1">
                  <Text className="text-xs font-medium text-green-600 dark:text-green-400">
                    Added ({preview.addedGroupNames.length})
                  </Text>
                  <div className="border rounded-md divide-y max-h-32 overflow-y-auto">
                    {preview.addedGroupNames.map((n) => (
                      <div key={n} className="px-3 py-1 text-sm">
                        {n}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preview.removedGroupNames.length > 0 && (
                <div className="space-y-1">
                  <Text className="text-xs font-medium text-destructive">
                    Removed ({preview.removedGroupNames.length})
                  </Text>
                  <div className="border rounded-md divide-y max-h-32 overflow-y-auto">
                    {preview.removedGroupNames.map((n) => (
                      <div
                        key={n}
                        className="px-3 py-1 text-sm text-muted-foreground line-through"
                      >
                        {n}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preview.updatedGroupNames.length > 0 && (
                <div className="space-y-1">
                  <Text className="text-xs font-medium text-amber-600 dark:text-amber-400">
                    Updated ({preview.updatedGroupNames.length})
                  </Text>
                  <div className="border rounded-md divide-y max-h-32 overflow-y-auto">
                    {preview.updatedGroupNames.map((n) => (
                      <div key={n} className="px-3 py-1 text-sm">
                        {n}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preview.totalMissing > 0 && (
                <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="size-3 shrink-0" />
                  <span>
                    {preview.totalMissing} member
                    {preview.totalMissing !== 1 ? "s" : ""} not found in roster
                  </span>
                </div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleReimport} disabled={!canImport}>
            {importing ? "Importing..." : "Confirm Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
