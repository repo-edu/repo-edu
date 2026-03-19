import type { GroupSetLmsSummary } from "@repo-edu/application-contract"
import type { GroupSetConnection } from "@repo-edu/domain/types"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from "@repo-edu/ui"
import { AlertTriangle, Loader2 } from "@repo-edu/ui/components/icons"
import { useEffect, useMemo, useRef, useState } from "react"
import { getWorkflowClient } from "../../contexts/workflow-client.js"
import { useAppSettingsStore } from "../../stores/app-settings-store.js"
import { useCourseStore } from "../../stores/course-store.js"
import { useUiStore } from "../../stores/ui-store.js"
import { getErrorMessage } from "../../utils/error-message.js"

function connectedExternalId(
  connection: GroupSetConnection | null,
): string | null {
  if (!connection) return null
  if (connection.kind === "canvas") return connection.groupSetId
  if (connection.kind === "moodle") return connection.groupingId
  return null
}

export function ConnectLmsGroupSetDialog() {
  const open = useUiStore((state) => state.connectLmsGroupSetDialogOpen)
  const setOpen = useUiStore((state) => state.setConnectLmsGroupSetDialogOpen)
  const setSidebarSelection = useUiStore((state) => state.setSidebarSelection)
  const setGroupSetOperation = useUiStore((state) => state.setGroupSetOperation)
  const course = useCourseStore((state) => state.course)
  const roster = useCourseStore((state) => state.course?.roster ?? null)
  const setRoster = useCourseStore((state) => state.setRoster)
  const appSettings = useAppSettingsStore((state) => state.settings)

  const [groupSets, setGroupSets] = useState<GroupSetLmsSummary[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [loading, setLoading] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progressMessage, setProgressMessage] = useState<string | null>(null)
  const connectRequestIdRef = useRef(0)

  const connectedIds = useMemo(() => {
    if (!roster) return new Set<string>()
    return new Set(
      roster.groupSets
        .map((groupSet) => connectedExternalId(groupSet.connection))
        .filter((id): id is string => Boolean(id)),
    )
  }, [roster])

  const availableGroupSets = useMemo(
    () => groupSets.filter((groupSet) => !connectedIds.has(groupSet.id)),
    [groupSets, connectedIds],
  )

  useEffect(() => {
    if (!open) return
    if (availableGroupSets.some((groupSet) => groupSet.id === selectedId)) {
      return
    }
    setSelectedId(availableGroupSets[0]?.id ?? "")
  }, [availableGroupSets, open, selectedId])

  useEffect(() => {
    if (!open || !course) return

    let cancelled = false
    setLoading(true)
    setError(null)

    const client = getWorkflowClient()
    client
      .run("groupSet.fetchAvailableFromLms", {
        course,
        appSettings,
      })
      .then((list) => {
        if (cancelled) return
        const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name))
        setGroupSets(sorted)
        setSelectedId(sorted[0]?.id ?? "")
      })
      .catch((cause) => {
        if (cancelled) return
        setGroupSets([])
        setSelectedId("")
        setError(getErrorMessage(cause))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, course, appSettings])

  const selectedGroupSet = useMemo(
    () => availableGroupSets.find((groupSet) => groupSet.id === selectedId),
    [availableGroupSets, selectedId],
  )

  const canConnect =
    open &&
    !!roster &&
    !!course &&
    !!selectedGroupSet &&
    !loading &&
    !connecting

  const handleClose = () => {
    connectRequestIdRef.current += 1
    setGroupSetOperation(null)
    setOpen(false)
    setSelectedId("")
    setError(null)
    setLoading(false)
    setConnecting(false)
    setGroupSets([])
    setProgressMessage(null)
  }

  const handleConnect = async () => {
    if (!canConnect || !roster || !course || !selectedGroupSet) {
      return
    }
    const requestId = connectRequestIdRef.current + 1
    connectRequestIdRef.current = requestId

    const client = getWorkflowClient()

    setConnecting(true)
    setError(null)
    setProgressMessage("Connecting to LMS...")
    setGroupSetOperation({ kind: "connect" })

    try {
      const result = await client.run(
        "groupSet.connectFromLms",
        {
          course,
          appSettings,
          remoteGroupSetId: selectedGroupSet.id,
        },
        {
          onProgress: (p) => {
            if (connectRequestIdRef.current !== requestId) return
            setProgressMessage(p.label)
          },
        },
      )
      if (connectRequestIdRef.current !== requestId) return

      setRoster(result.roster, `Connect group set "${selectedGroupSet.name}"`)
      setSidebarSelection({ kind: "group-set", id: result.id })
      handleClose()
    } catch (cause) {
      if (connectRequestIdRef.current !== requestId) return
      const message = getErrorMessage(cause)
      setError(message)
      setProgressMessage(null)
    } finally {
      if (connectRequestIdRef.current === requestId) {
        setConnecting(false)
        setGroupSetOperation(null)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Connected Group Set</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <Text className="text-sm">{error}</Text>
            </Alert>
          )}

          {!error && availableGroupSets.length === 0 && !loading && (
            <Alert>
              <Text className="text-sm">
                All LMS group sets are already connected for this course.
              </Text>
            </Alert>
          )}

          <FormField label="LMS Group Set" htmlFor="connect-group-set-select">
            <Select
              value={selectedId}
              onValueChange={setSelectedId}
              disabled={
                loading || connecting || availableGroupSets.length === 0
              }
            >
              <SelectTrigger id="connect-group-set-select">
                <SelectValue
                  placeholder={
                    loading ? "Loading group sets..." : "Select a group set"
                  }
                />
              </SelectTrigger>
              <SelectContent className="z-[100]">
                {availableGroupSets.map((groupSet) => (
                  <SelectItem key={groupSet.id} value={groupSet.id}>
                    {groupSet.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {connecting && (
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>{progressMessage ?? "Connecting group set..."}</span>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleConnect} disabled={!canConnect}>
            {connecting ? "Connecting..." : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
