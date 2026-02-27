/**
 * Dialog for importing a group set from CSV file.
 *
 * Flow: Browse file -> Preview parsed groups -> Optionally edit name -> Import
 */

import type {
  GroupSelectionMode,
  GroupSetImportPreview,
} from "@repo-edu/backend-interface/types"
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
  Label,
  RadioGroup,
  RadioGroupItem,
  Text,
} from "@repo-edu/ui"
import { AlertTriangle, Folder } from "@repo-edu/ui/components/icons"
import { useState } from "react"
import { commands } from "../../bindings/commands"
import { openDialog } from "../../services/platform"
import { useProfileStore } from "../../stores/profileStore"
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

export function ImportGroupSetDialog() {
  const [filePath, setFilePath] = useState("")
  const [name, setName] = useState("")
  const [preview, setPreview] = useState<
    (GroupSetImportPreview & { mode: "import" }) | null
  >(null)
  const [selectionKind, setSelectionKind] = useState<"all" | "pattern">("all")
  const [pattern, setPattern] = useState("")
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = useUiStore((state) => state.importGroupSetDialogOpen)
  const setOpen = useUiStore((state) => state.setImportGroupSetDialogOpen)
  const setSidebarSelection = useUiStore((state) => state.setSidebarSelection)
  const setGroupSetOperation = useUiStore((state) => state.setGroupSetOperation)
  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const setRoster = useProfileStore((state) => state.setRoster)
  const addToast = useToastStore((state) => state.addToast)

  const handleBrowse = async () => {
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: "CSV Files", extensions: ["csv"] }],
        title: "Select CSV file to import",
      })
      if (!selected) return

      setFilePath(selected)
      setError(null)

      // Extract default name from filename (without extension)
      const filename = selected.split(/[/\\]/).pop() ?? selected
      const defaultName = filename.replace(/\.csv$/i, "")
      setName(defaultName)

      // Fetch preview
      if (!roster) {
        setError("No roster loaded")
        return
      }

      setLoading(true)
      const result = await commands.previewImportGroupSet(roster, selected)
      if (result.status === "ok" && result.data.mode === "import") {
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

  const canImport = preview !== null && name.trim().length > 0 && !importing

  const handleImport = async () => {
    if (!canImport || !roster) return
    setImporting(true)
    setError(null)
    setGroupSetOperation({ kind: "import", groupSetId: null })

    try {
      const result = await commands.importGroupSet(roster, filePath)
      if (result.status === "ok") {
        const importResult = result.data
        const groupSetName = name.trim()
        const groupSelection: GroupSelectionMode =
          selectionKind === "pattern"
            ? {
                kind: "pattern",
                pattern: pattern || "*",
                excluded_group_ids: [],
              }
            : { kind: "all", excluded_group_ids: [] }
        const patchedGroupSet = {
          ...importResult.group_set,
          name: groupSetName,
          group_selection: groupSelection,
        }
        const updatedRoster = applyGroupSetPatch(roster, {
          ...importResult,
          group_set: patchedGroupSet,
        })
        setRoster(updatedRoster, `Import group set "${name.trim()}"`)
        setSidebarSelection({ kind: "group-set", id: patchedGroupSet.id })
        addToast(`Imported "${groupSetName}"`, { tone: "success" })
        handleClose()
      } else {
        const message = formatAppErrorMessage(result.error)
        setError(message)
        addToast(`Import failed: ${result.error.message}`, { tone: "error" })
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setError(message)
      addToast(`Import failed: ${message}`, { tone: "error" })
    } finally {
      setImporting(false)
      setGroupSetOperation(null)
    }
  }

  const handleClose = () => {
    setOpen(false)
    setGroupSetOperation(null)
    setFilePath("")
    setName("")
    setSelectionKind("all")
    setPattern("")
    setPreview(null)
    setLoading(false)
    setImporting(false)
    setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Group Set from CSV</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <Text className="text-sm whitespace-pre-wrap">{error}</Text>
            </Alert>
          )}

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

          {/* Name input */}
          {preview && (
            <FormField label="Group Set Name" htmlFor="import-gs-name">
              <Input
                id="import-gs-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Project Teams"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canImport) handleImport()
                }}
              />
            </FormField>
          )}

          {/* Loading state */}
          {loading && (
            <Text className="text-sm text-muted-foreground">
              Loading preview...
            </Text>
          )}

          {/* Preview */}
          {preview && (
            <div className="space-y-2">
              <Text className="text-sm font-medium">
                Preview: {preview.groups.length} group
                {preview.groups.length !== 1 ? "s" : ""}
              </Text>

              <div className="border rounded-md max-h-48 overflow-y-auto divide-y">
                {preview.groups.map((g) => (
                  <div
                    key={g.name}
                    className="flex items-center justify-between px-3 py-1.5 text-sm"
                  >
                    <span className="truncate">{g.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">
                      {g.member_count} member{g.member_count !== 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
              </div>

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

          {/* Group selection */}
          {preview && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Group selection</Label>
              <RadioGroup
                value={selectionKind}
                onValueChange={(v) => setSelectionKind(v as "all" | "pattern")}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="all" id="import-gs-sel-all" />
                  <Label htmlFor="import-gs-sel-all" className="text-sm">
                    All groups
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="pattern" id="import-gs-sel-pattern" />
                  <Label htmlFor="import-gs-sel-pattern" className="text-sm">
                    Pattern filter
                  </Label>
                </div>
              </RadioGroup>
              {selectionKind === "pattern" && (
                <div className="pl-6 space-y-1.5">
                  <Input
                    value={pattern}
                    onChange={(e) => setPattern(e.target.value)}
                    placeholder="e.g., 1D* or Team-*"
                    className="h-7 text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Glob pattern matched against group names. Use * for
                    wildcard.
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!canImport}>
            {importing ? "Importing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
