import type {
  GroupSetImportFormat,
  GroupSetImportPreview,
} from "@repo-edu/domain/types"
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
import { useEffect, useMemo, useState } from "react"
import { getRendererHost } from "../../contexts/renderer-host.js"
import { getWorkflowClient } from "../../contexts/workflow-client.js"
import {
  selectGroupSetById,
  useCourseStore,
} from "../../stores/course-store.js"
import { useUiStore } from "../../stores/ui-store.js"
import { getErrorMessage } from "../../utils/error-message.js"

const FORMAT_HINTS: Record<GroupSetImportFormat, string> = {
  "group-set-csv": "CSV — named groups with member emails",
  "repobee-students": "TXT — unnamed teams with usernames",
}

function nameModeToFormat(nameMode: "named" | "unnamed"): GroupSetImportFormat {
  return nameMode === "named" ? "group-set-csv" : "repobee-students"
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
  const [preview, setPreview] = useState<GroupSetImportPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // New-import trigger
  const newImportFormat = useUiStore((state) => state.importGroupSetFormat)
  const setNewImportFormat = useUiStore(
    (state) => state.setImportGroupSetFormat,
  )

  // Reimport trigger
  const reimportTargetId = useUiStore((state) => state.reimportGroupSetTargetId)
  const setReimportTargetId = useUiStore(
    (state) => state.setReimportGroupSetTargetId,
  )

  const setSidebarSelection = useUiStore((state) => state.setSidebarSelection)
  const setGroupSetOperation = useUiStore((state) => state.setGroupSetOperation)
  const course = useCourseStore((state) => state.course)
  const setRoster = useCourseStore((state) => state.setRoster)
  const setIdSequences = useCourseStore((state) => state.setIdSequences)

  const reimportGroupSet = useCourseStore(
    selectGroupSetById(reimportTargetId ?? ""),
  )

  // Clear stale reimport target when the group set no longer exists
  useEffect(() => {
    if (reimportTargetId !== null && !reimportGroupSet) {
      setReimportTargetId(null)
    }
  }, [reimportTargetId, reimportGroupSet, setReimportTargetId])

  // Derived state — isReimport requires the target group set to exist
  const isReimport = reimportTargetId !== null && reimportGroupSet !== null
  const format: GroupSetImportFormat | null = isReimport
    ? nameModeToFormat(reimportGroupSet.nameMode)
    : newImportFormat
  const open = format !== null

  const canImport =
    preview !== null && fileRef !== null && format !== null && !importing

  const title = isReimport
    ? `Import: ${reimportGroupSet?.name ?? "Group Set"}`
    : format === "group-set-csv"
      ? "Import Named Groups"
      : "Import Unnamed Teams"

  const targetGroupSetId = isReimport ? reimportTargetId : null

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
        targetGroupSetId,
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
    if (!format) return
    try {
      const host = getRendererHost()
      const acceptFormats =
        format === "group-set-csv" ? (["csv"] as const) : (["txt"] as const)
      const picked = await host.pickUserFile({
        title: "Select group-set import file",
        acceptFormats,
      })
      if (!picked) return

      setFileRef(picked)
      setFileName(picked.displayName)
      await runPreview(picked, format)
    } catch (cause) {
      setError(getErrorMessage(cause))
    }
  }

  const handleImport = async () => {
    if (!canImport || !course || !fileRef || !format) return

    setImporting(true)
    setError(null)
    setGroupSetOperation(
      isReimport
        ? { kind: "reimport", groupSetId: reimportTargetId as string }
        : { kind: "import" },
    )

    try {
      const client = getWorkflowClient()
      const nextCourse = await client.run("groupSet.importFromFile", {
        course,
        file: fileRef,
        format,
        targetGroupSetId,
      })

      const actionLabel = isReimport
        ? `Import into group set "${reimportGroupSet?.name ?? ""}"`
        : "Import group set from file"
      setRoster(nextCourse.roster, actionLabel)
      setIdSequences(nextCourse.idSequences)

      if (!isReimport) {
        const importedSet = [...nextCourse.roster.groupSets]
          .reverse()
          .find((groupSet) => groupSet.connection?.kind === "import")
        if (importedSet) {
          setSidebarSelection({ kind: "group-set", id: importedSet.id })
        }
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
    setNewImportFormat(null)
    setReimportTargetId(null)
    setGroupSetOperation(null)
    setFileName("")
    setFileRef(null)
    setPreview(null)
    setLoading(false)
    setImporting(false)
    setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
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
            {format && (
              <Text className="text-xs text-muted-foreground mt-1">
                Format: {FORMAT_HINTS[format]}
              </Text>
            )}
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
            {importing
              ? "Importing..."
              : isReimport
                ? "Confirm Import"
                : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
