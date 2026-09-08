import type { GroupSetLmsSummary } from "@repo-edu/application-contract"
import { courseSupportsLms } from "@repo-edu/domain/types"
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
import { useEffect, useState } from "react"
import { useLmsPreview } from "../../session/lms-preview.js"
import { useSessionController } from "../../session/session-controller-context.js"
import { useCourseStore } from "../../stores/course-store.js"
import { useUiStore } from "../../stores/ui-store.js"
import { getErrorMessage } from "../../utils/error-message.js"

type Discovery =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; groupSets: GroupSetLmsSummary[]; selectedId: string }

export function ConnectLmsGroupSetDialog() {
  const open = useUiStore((state) => state.connectLmsGroupSetDialogOpen)
  const syncId = useUiStore((state) => state.syncGroupSetTriggerId)
  const course = useCourseStore((state) => state.course)
  return (open || syncId !== null) && course && courseSupportsLms(course) ? (
    <GroupSetPreviewDialog
      key={JSON.stringify([course.id, syncId])}
      courseId={course.id}
      syncId={syncId}
    />
  ) : null
}

function GroupSetPreviewDialog({
  courseId,
  syncId,
}: {
  courseId: string
  syncId: string | null
}) {
  const controller = useSessionController()
  const course = useCourseStore((state) => state.course)
  const setOpen = useUiStore((state) => state.setConnectLmsGroupSetDialogOpen)
  const setSyncId = useUiStore((state) => state.setSyncGroupSetTriggerId)
  const setSelection = useUiStore((state) => state.setSidebarSelection)
  const [discovery, setDiscovery] = useState<Discovery>({ status: "loading" })
  const { state, preview, apply, reset } = useLmsPreview()

  useEffect(() => {
    if (syncId !== null) return
    let cancelled = false
    void controller.operations.execute(
      "groupSet.fetchAvailableFromLms",
      async (scope) => {
        const current = useCourseStore.getState().course
        if (current?.id !== courseId) return
        try {
          const groupSets = await scope.run("groupSet.fetchAvailableFromLms", {
            course: current,
            credentials: controller.getSnapshot().settings.credentials,
          })
          scope.publish(() => {
            if (!cancelled)
              setDiscovery({
                status: "ready",
                groupSets: [...groupSets].sort((a, b) =>
                  a.name.localeCompare(b.name),
                ),
                selectedId: "",
              })
          })
        } catch (error) {
          if (!cancelled && scope.canContinue())
            scope.publish(() =>
              setDiscovery({
                status: "error",
                message: getErrorMessage(error),
              }),
            )
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [controller, courseId, syncId])

  const connectedIds = new Set(
    course?.roster.groupSets.flatMap(({ connection }) =>
      connection?.kind === "canvas"
        ? [connection.groupSetId]
        : connection?.kind === "moodle"
          ? [connection.groupingId]
          : [],
    ) ?? [],
  )
  const available =
    discovery.status === "ready"
      ? discovery.groupSets.filter((groupSet) => !connectedIds.has(groupSet.id))
      : []
  const selectedId =
    discovery.status === "ready" &&
    available.some(({ id }) => id === discovery.selectedId)
      ? discovery.selectedId
      : (available[0]?.id ?? "")
  const result =
    state.status === "ready" && "id" in state.result ? state.result : null
  const close = () => {
    setOpen(false)
    setSyncId(null)
  }
  const targetId = syncId ?? selectedId
  const target = course?.roster.groupSets.find(({ id }) => id === syncId)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {syncId === null
              ? "Add Connected Group Set"
              : "Sync Group Set from LMS"}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {syncId === null ? (
            <>
              {discovery.status === "error" && (
                <Alert variant="destructive">{discovery.message}</Alert>
              )}
              <FormField
                label="LMS Group Set"
                htmlFor="connect-group-set-select"
              >
                <Select
                  value={selectedId}
                  disabled={
                    state.status === "loading" || discovery.status !== "ready"
                  }
                  onValueChange={(selectedId) => {
                    if (discovery.status === "ready") {
                      setDiscovery({ ...discovery, selectedId })
                      reset()
                    }
                  }}
                >
                  <SelectTrigger id="connect-group-set-select">
                    <SelectValue
                      placeholder={
                        discovery.status === "loading"
                          ? "Loading group sets..."
                          : "Select a group set"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((groupSet) => (
                      <SelectItem key={groupSet.id} value={groupSet.id}>
                        {groupSet.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              {discovery.status === "ready" && available.length === 0 && (
                <Text>
                  All LMS group sets are already connected for this course.
                </Text>
              )}
            </>
          ) : (
            <Text>{target?.name ?? "Group set no longer available"}</Text>
          )}
          {state.status === "loading" && <Text>{state.message}</Text>}
          {state.status === "error" && (
            <Alert variant="destructive">{state.message}</Alert>
          )}
          {result && (
            <div className="rounded-md border p-3 space-y-2">
              <Text className="font-medium">Preview: {result.name}</Text>
              <ul className="max-h-64 overflow-auto text-sm">
                {result.nameMode === "named" &&
                  result.groupIds.map((id) => {
                    const group = result.roster.groups.find(
                      (group) => group.id === id,
                    )
                    return (
                      <li key={id}>
                        {group?.name}: {group?.memberIds.length ?? 0} members
                      </li>
                    )
                  })}
              </ul>
              <Text className="text-xs text-muted-foreground">
                Apply replaces this group set's membership with the preview.
              </Text>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="outline"
            disabled={!targetId || state.status === "loading"}
            onClick={() =>
              void preview(
                syncId === null
                  ? "groupSet.connectFromLms"
                  : "groupSet.syncFromLms",
                courseId,
                targetId,
              )
            }
          >
            {state.status === "idle" ? "Preview" : "Refresh Preview"}
          </Button>
          <Button
            disabled={!result}
            onClick={() => {
              const accepted = apply()
              if (accepted && "id" in accepted) {
                setSelection({ kind: "group-set", id: accepted.id })
                close()
              }
            }}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
