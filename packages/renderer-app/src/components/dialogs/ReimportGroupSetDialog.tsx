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
import { useState } from "react"
import { getRendererHost } from "../../contexts/renderer-host.js"
import { getWorkflowClient } from "../../contexts/workflow-client.js"
import {
  selectGroupSetById,
  useCourseStore,
} from "../../stores/course-store.js"
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

export function ReimportGroupSetDialog() {
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

  const targetId = useUiStore((state) => state.reimportGroupSetTargetId)
  const setTargetId = useUiStore((state) => state.setReimportGroupSetTargetId)
  const setGroupSetOperation = useUiStore((state) => state.setGroupSetOperation)
  const open = targetId !== null
  const course = useCourseStore((state) => state.course)
  const groupSet = useCourseStore(selectGroupSetById(targetId ?? ""))
  const setRoster = useCourseStore((state) => state.setRoster)
  const setIdSequences = useCourseStore((state) => state.setIdSequences)

  const runPreview = async (
    nextFileRef: NonNullable<typeof fileRef>,
    nextFormat: GroupSetImportFormat,
  ) => {
    if (!targetId || !course) return

    setLoading(true)
    setError(null)
    try {
      const client = getWorkflowClient()
      const result = await client.run("groupSet.previewImportFromFile", {
        course,
        file: nextFileRef,
        format: nextFormat,
        targetGroupSetId: targetId,
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
    if (!targetId || !course) return

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
    if (!targetId || !course || !fileRef || !preview) return

    setImporting(true)
    setError(null)
    setGroupSetOperation({ kind: "reimport", groupSetId: targetId })

    try {
      const client = getWorkflowClient()
      const nextCourse = await client.run("groupSet.importFromFile", {
        course,
        file: fileRef,
        format,
        targetGroupSetId: targetId,
      })

      setRoster(
        nextCourse.roster,
        `Import into group set "${groupSet?.name ?? ""}"`,
      )
      setIdSequences(nextCourse.idSequences)
      handleClose()
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setImporting(false)
      setGroupSetOperation(null)
    }
  }

  const handleClose = () => {
    setTargetId(null)
    setGroupSetOperation(null)
    setFileName("")
    setFileRef(null)
    setFormat("group-set-csv")
    setPreview(null)
    setLoading(false)
    setImporting(false)
    setError(null)
  }

  const canImport = preview !== null && !importing

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <DialogContent>
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
                <RadioGroupItem
                  value="group-set-csv"
                  id="reimport-format-csv"
                />
                <Label htmlFor="reimport-format-csv" className="text-sm">
                  CSV (group_name,name,email)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="repobee-students"
                  id="reimport-format-repobee"
                />
                <Label htmlFor="reimport-format-repobee" className="text-sm">
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

          {preview?.mode === "import" && (
            <Text className="text-sm text-muted-foreground">
              Preview: {preview.groups.length} groups
            </Text>
          )}

          {preview?.mode === "replace" && (
            <Text className="text-sm text-muted-foreground">
              Preview: +{preview.addedTeams.length} added, -
              {preview.removedTeams.length} removed,{" "}
              {preview.changedTeams.length} changed
            </Text>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!canImport}>
            {importing ? "Importing..." : "Confirm Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
