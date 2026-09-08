import { courseSupportsLms } from "@repo-edu/domain/types"
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from "@repo-edu/ui"
import { useLmsPreview } from "../../session/lms-preview.js"
import { selectCredentials } from "../../session/selectors.js"
import {
  useSessionController,
  useSessionControllerSelector,
} from "../../session/session-controller-context.js"
import { useCourseStore } from "../../stores/course-store.js"
import { useUiStore } from "../../stores/ui-store.js"
import { lmsConnectionDisplayName } from "../settings/ConnectionsPane.shared.js"

export function StudentSyncDialog() {
  const open = useUiStore((state) => state.rosterSyncDialogOpen)
  const course = useCourseStore((state) => state.course)
  return open && course && courseSupportsLms(course) ? (
    <RosterPreviewDialog key={course.id} courseId={course.id} />
  ) : null
}

function RosterPreviewDialog({ courseId }: { courseId: string }) {
  const controller = useSessionController()
  const credentials = useSessionControllerSelector(selectCredentials)
  const course = useCourseStore((state) => state.course)
  const setOpen = useUiStore((state) => state.setRosterSyncDialogOpen)
  const setConflicts = useUiStore((state) => state.setLmsImportConflicts)
  const { state, preview, apply } = useLmsPreview()
  const result =
    state.status === "ready" && "summary" in state.result ? state.result : null
  const close = () => {
    setOpen(false)
    setConflicts(null)
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sync Roster from LMS</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <Text className="text-sm text-muted-foreground">
            Preview changes to students and staff, then apply the reviewed
            roster.
          </Text>
          <Label htmlFor="student-sync-lms-connection">LMS connection</Label>
          <Select
            value={course?.lmsConnectionId ?? ""}
            onValueChange={(id) => controller.setLmsConnectionId(courseId, id)}
          >
            <SelectTrigger id="student-sync-lms-connection">
              <SelectValue placeholder="Select a connection" />
            </SelectTrigger>
            <SelectContent>
              {credentials.lmsConnections.map((connection) => (
                <SelectItem key={connection.id} value={connection.id}>
                  {lmsConnectionDisplayName(connection)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {state.status === "loading" && <Text>{state.message}</Text>}
          {state.status === "error" && (
            <Alert variant="destructive">{state.message}</Alert>
          )}
          {result && (
            <div className="rounded-md border p-3 space-y-2">
              <p className="text-sm font-medium">
                Preview: {result.roster.students.length} students,{" "}
                {result.roster.staff.length} staff
              </p>
              <p className="text-xs text-muted-foreground">
                Pending sync: +{result.summary.membersAdded} to add,{" "}
                {result.summary.membersUpdated} to update,{" "}
                {result.summary.membersUnchanged} unchanged
              </p>
              {result.totalConflicts > 0 && (
                <>
                  <Text>
                    {result.totalConflicts} identity conflicts. Conflicted
                    entries remain unchanged.
                  </Text>
                  <Button
                    variant="outline"
                    onClick={() => setConflicts(result.conflicts)}
                  >
                    View Conflict Details
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="outline"
            disabled={
              state.status === "loading" ||
              !course?.lmsConnectionId ||
              !course.lmsCourseId
            }
            onClick={() => void preview("roster.importFromLms", courseId)}
          >
            {state.status === "idle" ? "Preview" : "Refresh Preview"}
          </Button>
          <Button
            disabled={!result}
            onClick={() => {
              if (apply()) close()
            }}
          >
            Apply Sync
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
