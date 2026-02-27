import type {
  GroupSet,
  GroupSetConnection,
  LmsGroupSet,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from "@repo-edu/ui"
import { AlertTriangle } from "@repo-edu/ui/components/icons"
import { useEffect, useMemo, useState } from "react"
import { commands } from "../../bindings/commands"
import { useAppSettingsStore } from "../../stores/appSettingsStore"
import { selectCourse, useProfileStore } from "../../stores/profileStore"
import { useToastStore } from "../../stores/toastStore"
import { useUiStore } from "../../stores/uiStore"
import { applyGroupSetPatch } from "../../utils/groupSetPatch"
import { generateGroupSetId } from "../../utils/nanoid"
import { buildLmsOperationContext } from "../../utils/operationContext"

function connectedExternalId(
  connection: GroupSetConnection | null,
): string | null {
  if (!connection) return null
  if (connection.kind === "canvas") return connection.group_set_id
  if (connection.kind === "moodle") return connection.grouping_id
  return null
}

function asConnectedConnection(
  lmsType: "canvas" | "moodle",
  courseId: string,
  groupSetId: string,
): GroupSetConnection {
  const now = new Date().toISOString()
  if (lmsType === "canvas") {
    return {
      kind: "canvas",
      course_id: courseId,
      group_set_id: groupSetId,
      last_updated: now,
    }
  }
  return {
    kind: "moodle",
    course_id: courseId,
    grouping_id: groupSetId,
    last_updated: now,
  }
}

export function ConnectLmsGroupSetDialog() {
  const open = useUiStore((state) => state.connectLmsGroupSetDialogOpen)
  const setOpen = useUiStore((state) => state.setConnectLmsGroupSetDialogOpen)
  const setSidebarSelection = useUiStore((state) => state.setSidebarSelection)
  const setGroupSetOperation = useUiStore((state) => state.setGroupSetOperation)
  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const setRoster = useProfileStore((state) => state.setRoster)
  const course = useProfileStore(selectCourse)
  const lmsConnection = useAppSettingsStore((state) => state.lmsConnection)
  const addToast = useToastStore((state) => state.addToast)

  const [groupSets, setGroupSets] = useState<LmsGroupSet[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [loading, setLoading] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lmsContext = useMemo(
    () => buildLmsOperationContext(lmsConnection, course.id),
    [course.id, lmsConnection],
  )

  const connectedIds = useMemo(() => {
    if (!roster) return new Set<string>()
    return new Set(
      roster.group_sets
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
    if (!open) return
    if (!lmsContext) {
      setGroupSets([])
      setSelectedId("")
      setError("LMS connection or course is not configured")
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    commands
      .fetchLmsGroupSetList(lmsContext)
      .then(
        (result) => {
          if (cancelled) return
          if (result.status === "ok") {
            const list = [...result.data].sort((a, b) =>
              a.name.localeCompare(b.name),
            )
            setGroupSets(list)
            setSelectedId(list[0]?.id ?? "")
            return
          }
          setGroupSets([])
          setSelectedId("")
          setError(result.error.message)
        },
        (cause) => {
          if (cancelled) return
          setGroupSets([])
          setSelectedId("")
          setError(cause instanceof Error ? cause.message : String(cause))
        },
      )
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, lmsContext])

  const selectedGroupSet = useMemo(
    () => availableGroupSets.find((groupSet) => groupSet.id === selectedId),
    [availableGroupSets, selectedId],
  )

  const canConnect =
    open &&
    !!roster &&
    !!lmsContext &&
    !!selectedGroupSet &&
    !loading &&
    !connecting

  const handleClose = () => {
    setOpen(false)
    setSelectedId("")
    setError(null)
    setLoading(false)
    setConnecting(false)
    setGroupSets([])
  }

  const handleConnect = async () => {
    if (!canConnect || !roster || !lmsContext || !selectedGroupSet) return

    const provisionalId = generateGroupSetId()
    const provisionalGroupSet: GroupSet = {
      id: provisionalId,
      name: selectedGroupSet.name,
      group_ids: [],
      connection: asConnectedConnection(
        lmsContext.connection.lms_type,
        lmsContext.course_id,
        selectedGroupSet.id,
      ),
      group_selection: { kind: "all", excluded_group_ids: [] },
    }
    const rosterWithProvisional = {
      ...roster,
      group_sets: [...roster.group_sets, provisionalGroupSet],
    }

    setConnecting(true)
    setError(null)
    setGroupSetOperation({ kind: "sync", groupSetId: provisionalId })
    try {
      const result = await commands.syncGroupSet(
        lmsContext,
        rosterWithProvisional,
        provisionalId,
      )
      if (result.status === "ok") {
        const updatedRoster = applyGroupSetPatch(roster, result.data)
        setRoster(updatedRoster, `Connect group set "${selectedGroupSet.name}"`)
        setSidebarSelection({ kind: "group-set", id: provisionalId })
        addToast(`Connected "${selectedGroupSet.name}"`, { tone: "success" })
        handleClose()
        return
      }

      setError(result.error.message)
      addToast(`Connect failed: ${result.error.message}`, { tone: "error" })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(message)
      addToast(`Connect failed: ${message}`, { tone: "error" })
    } finally {
      setConnecting(false)
      setGroupSetOperation(null)
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
