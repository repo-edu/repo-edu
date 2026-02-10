/**
 * Dialog for importing a CSV into an existing imported group set.
 *
 * Shows a diff preview (added/removed/updated groups) before confirming.
 */

import type { GroupSetImportPreview } from "@repo-edu/backend-interface/types"
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
import { commands } from "../../bindings/commands"
import { openDialog } from "../../services/platform"
import { useOutputStore } from "../../stores/outputStore"
import { selectGroupSetById, useProfileStore } from "../../stores/profileStore"
import { useToastStore } from "../../stores/toastStore"
import { useUiStore } from "../../stores/uiStore"
import { applyGroupSetPatch } from "../../utils/groupSetPatch"

function formatAppErrorMessage(error: {
  message: string
  details?: string | null
}) {
  if (!error.details) return error.message
  return `${error.message}\n${error.details}`
}

export function ReimportGroupSetDialog() {
  const [filePath, setFilePath] = useState("")
  const [preview, setPreview] = useState<
    (GroupSetImportPreview & { mode: "reimport" }) | null
  >(null)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const targetId = useUiStore((state) => state.reimportGroupSetTargetId)
  const setTargetId = useUiStore((state) => state.setReimportGroupSetTargetId)
  const setGroupSetOperation = useUiStore((state) => state.setGroupSetOperation)
  const open = targetId !== null
  const groupSet = useProfileStore(selectGroupSetById(targetId ?? ""))
  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const setRoster = useProfileStore((state) => state.setRoster)
  const appendOutput = useOutputStore((state) => state.appendText)
  const addToast = useToastStore((state) => state.addToast)

  const sourcePath =
    groupSet?.connection?.kind === "import"
      ? groupSet.connection.source_path
      : undefined

  const handleBrowse = async () => {
    if (!targetId || !roster) return

    try {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: "CSV Files", extensions: ["csv"] }],
        title: "Select CSV file for import",
        defaultPath: sourcePath,
      })
      if (!selected) return

      setFilePath(selected)
      setError(null)
      setLoading(true)

      const result = await commands.previewReimportGroupSet(
        roster,
        targetId,
        selected,
      )
      if (result.status === "ok" && result.data.mode === "reimport") {
        setPreview(result.data)
      } else {
        setError(
          result.status === "error"
            ? formatAppErrorMessage(result.error)
            : "Unexpected preview mode",
        )
        setPreview(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const canImport = preview !== null && !importing

  const handleReimport = async () => {
    if (!canImport || !roster || !targetId) return
    setImporting(true)
    setError(null)
    setGroupSetOperation({ kind: "reimport", groupSetId: targetId })

    try {
      const result = await commands.reimportGroupSet(roster, targetId, filePath)
      if (result.status === "ok") {
        const importResult = result.data
        const updatedRoster = applyGroupSetPatch(roster, importResult)
        const groupSetName = groupSet?.name ?? targetId

        setRoster(updatedRoster, `Import group set "${groupSetName}"`)
        appendOutput(`Imported group set "${groupSetName}"`, "success")
        addToast(`Imported "${groupSetName}"`, { tone: "success" })
        handleClose()
      } else {
        const message = formatAppErrorMessage(result.error)
        setError(message)
        appendOutput(`Import failed: ${result.error.message}`, "error")
        addToast(`Import failed: ${result.error.message}`, { tone: "error" })
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setError(message)
      appendOutput(`Import failed: ${message}`, "error")
      addToast(`Import failed: ${message}`, { tone: "error" })
    } finally {
      setImporting(false)
      setGroupSetOperation(null)
    }
  }

  const handleClose = () => {
    setTargetId(null)
    setGroupSetOperation(null)
    setFilePath("")
    setPreview(null)
    setLoading(false)
    setImporting(false)
    setError(null)
  }

  const hasChanges =
    preview &&
    (preview.added_group_names.length > 0 ||
      preview.removed_group_names.length > 0 ||
      preview.updated_group_names.length > 0)

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

          {/* File picker */}
          <FormField label="CSV File">
            <div className="flex gap-2">
              <Input
                value={filePath}
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

          {/* Changes preview */}
          {preview && (
            <div className="space-y-3">
              <Text className="text-sm font-medium">Changes</Text>

              {!hasChanges && (
                <Text className="text-sm text-muted-foreground">
                  No changes detected.
                </Text>
              )}

              {preview.added_group_names.length > 0 && (
                <div className="space-y-1">
                  <Text className="text-xs font-medium text-green-600 dark:text-green-400">
                    Added ({preview.added_group_names.length})
                  </Text>
                  <div className="border rounded-md divide-y max-h-32 overflow-y-auto">
                    {preview.added_group_names.map((n) => (
                      <div key={n} className="px-3 py-1 text-sm">
                        {n}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preview.removed_group_names.length > 0 && (
                <div className="space-y-1">
                  <Text className="text-xs font-medium text-destructive">
                    Removed ({preview.removed_group_names.length})
                  </Text>
                  <div className="border rounded-md divide-y max-h-32 overflow-y-auto">
                    {preview.removed_group_names.map((n) => (
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

              {preview.updated_group_names.length > 0 && (
                <div className="space-y-1">
                  <Text className="text-xs font-medium text-amber-600 dark:text-amber-400">
                    Updated ({preview.updated_group_names.length})
                  </Text>
                  <div className="border rounded-md divide-y max-h-32 overflow-y-auto">
                    {preview.updated_group_names.map((n) => (
                      <div key={n} className="px-3 py-1 text-sm">
                        {n}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preview.total_missing > 0 && (
                <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="size-3 shrink-0" />
                  <span>
                    {preview.total_missing} member
                    {preview.total_missing !== 1 ? "s" : ""} not found in roster
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
