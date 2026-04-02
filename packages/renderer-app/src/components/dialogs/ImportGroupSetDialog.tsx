import type { GroupSetImportPreview } from "@repo-edu/domain/types"
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
import { useMemo, useState } from "react"
import { getRendererHost } from "../../contexts/renderer-host.js"
import { getWorkflowClient } from "../../contexts/workflow-client.js"
import { useCourseStore } from "../../stores/course-store.js"
import { useUiStore } from "../../stores/ui-store.js"
import { getErrorMessage } from "../../utils/error-message.js"

type GroupSetImportFormat = "group-set-csv" | "repobee-students"

function inferFormatFromFileRef(file: {
  displayName: string
  mediaType: string | null
}): GroupSetImportFormat | null {
  const lowered = file.displayName.toLowerCase()
  if (lowered.endsWith(".csv") || file.mediaType === "text/csv") {
    return "group-set-csv"
  }
  if (lowered.endsWith(".txt") || file.mediaType === "text/plain") {
    return "repobee-students"
  }
  return null
}

export function ImportGroupSetDialog() {
  const [fileName, setFileName] = useState("")
  const [fileRef, setFileRef] = useState<{
    kind: "user-file-ref"
    referenceId: string
    displayName: string
    mediaType: string | null
    byteLength: number | null
  } | null>(null)
  const [format, setFormat] = useState<GroupSetImportFormat>("group-set-csv")
  const [preview, setPreview] = useState<GroupSetImportPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = useUiStore((state) => state.importGroupSetDialogOpen)
  const setOpen = useUiStore((state) => state.setImportGroupSetDialogOpen)
  const setSidebarSelection = useUiStore((state) => state.setSidebarSelection)
  const setGroupSetOperation = useUiStore((state) => state.setGroupSetOperation)
  const course = useCourseStore((state) => state.course)
  const setRoster = useCourseStore((state) => state.setRoster)
  const setIdSequences = useCourseStore((state) => state.setIdSequences)

  const canImport = preview !== null && fileRef !== null && !importing

  const previewSummary = useMemo(() => {
    if (!preview) return null
    if (preview.mode === "import") {
      return `Preview: ${preview.groups.length} groups`
    }
    return `Preview: +${preview.addedTeams.length} added, -${preview.removedTeams.length} removed, ${preview.changedTeams.length} changed`
  }, [preview])

  const runPreview = async (
    nextFileRef: NonNullable<typeof fileRef>,
    nextFormat: GroupSetImportFormat,
  ) => {
    if (!course) {
      setError("No course loaded")
      return
    }

    setLoading(true)
    setError(null)
    try {
      const client = getWorkflowClient()
      const result = await client.run("groupSet.previewImportFromFile", {
        course,
        file: nextFileRef,
        format: nextFormat,
        targetGroupSetId: null,
      })
      setPreview(result)
    } catch (cause) {
      setPreview(null)
      setError(getErrorMessage(cause))
    } finally {
      setLoading(false)
    }
  }

  const handleBrowse = async () => {
    try {
      const host = getRendererHost()
      const picked = await host.pickUserFile({
        title: "Select group-set import file",
        acceptFormats: ["csv", "txt"],
      })
      if (!picked) return

      const inferred = inferFormatFromFileRef(picked) ?? "group-set-csv"
      setFileRef(picked)
      setFileName(picked.displayName)
      setFormat(inferred)
      await runPreview(picked, inferred)
    } catch (cause) {
      setError(getErrorMessage(cause))
    }
  }

  const handleImport = async () => {
    if (!canImport || !course || !fileRef) return

    setImporting(true)
    setError(null)
    setGroupSetOperation({ kind: "import" })

    try {
      const client = getWorkflowClient()
      const nextCourse = await client.run("groupSet.importFromFile", {
        course,
        file: fileRef,
        format,
        targetGroupSetId: null,
      })

      setRoster(nextCourse.roster, "Import group set from file")
      setIdSequences(nextCourse.idSequences)

      const importedSet = [...nextCourse.roster.groupSets]
        .reverse()
        .find((groupSet) => groupSet.connection?.kind === "import")
      if (importedSet) {
        setSidebarSelection({ kind: "group-set", id: importedSet.id })
      }

      handleClose()
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setImporting(false)
      setGroupSetOperation(null)
    }
  }

  const handleClose = () => {
    setOpen(false)
    setGroupSetOperation(null)
    setFileName("")
    setFileRef(null)
    setFormat("group-set-csv")
    setPreview(null)
    setLoading(false)
    setImporting(false)
    setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Group Set</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <Text className="text-sm whitespace-pre-wrap">{error}</Text>
            </Alert>
          )}

          <FormField label="Import File">
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

          <FormField label="Format">
            <RadioGroup
              value={format}
              onValueChange={(value) => {
                const next = value as GroupSetImportFormat
                setFormat(next)
                if (fileRef) {
                  void runPreview(fileRef, next)
                }
              }}
              className="space-y-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="group-set-csv" id="import-format-csv" />
                <Label htmlFor="import-format-csv" className="text-sm">
                  CSV (group_name,name,email)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="repobee-students"
                  id="import-format-repobee"
                />
                <Label htmlFor="import-format-repobee" className="text-sm">
                  RepoBee students file (.txt)
                </Label>
              </div>
            </RadioGroup>
          </FormField>

          {loading && (
            <Text className="text-sm text-muted-foreground">
              Loading preview...
            </Text>
          )}

          {previewSummary && (
            <Text className="text-sm text-muted-foreground">
              {previewSummary}
            </Text>
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
