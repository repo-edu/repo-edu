import type { Roster } from "@repo-edu/domain"
import { getRendererHost } from "../../contexts/renderer-host.js"
import { getWorkflowClient } from "../../contexts/workflow-client.js"
import {
  selectCourseId,
  selectLmsConnectionName,
  selectRoster,
  useCourseStore,
} from "../../stores/course-store.js"
import { useToastStore } from "../../stores/toast-store.js"
import { useUiStore } from "../../stores/ui-store.js"
import { getErrorMessage } from "../../utils/error-message.js"
import { NoCourseEmptyState } from "../NoCourseEmptyState.js"
import { MemberListPane } from "./students/MemberListPane.js"

export function StudentsTab() {
  const roster = useCourseStore(selectRoster)
  const course = useCourseStore((s) => s.course)
  const setRoster = useCourseStore((s) => s.setRoster)
  const lmsConnectionName = useCourseStore(selectLmsConnectionName)
  const courseId = useCourseStore(selectCourseId)
  const addToast = useToastStore((s) => s.addToast)

  const setImportFileDialogOpen = useUiStore((s) => s.setImportFileDialogOpen)
  const setRosterSyncDialogOpen = useUiStore((s) => s.setRosterSyncDialogOpen)
  const setImportGitUsernamesDialogOpen = useUiStore(
    (s) => s.setImportGitUsernamesDialogOpen,
  )
  const setUsernameVerificationDialogOpen = useUiStore(
    (s) => s.setUsernameVerificationDialogOpen,
  )

  const hasLmsConnection = lmsConnectionName !== null
  const hasCourseId = (courseId ?? "").trim() !== ""
  const canImportFromLms = hasLmsConnection && hasCourseId

  const lmsImportTooltip = !hasLmsConnection
    ? "Configure an LMS connection in Settings first"
    : !hasCourseId
      ? "No course configured for this course"
      : "Sync roster from LMS"

  const handleClear = () => {
    if (!roster?.students.length && !roster?.staff.length) return
    const emptyRoster: Roster = {
      connection: null,
      students: [],
      staff: [],
      groups: [],
      groupSets: [],
      assignments: [],
    }
    setRoster(emptyRoster, "Clear roster")
  }

  const handleExport = async (format: "csv" | "xlsx") => {
    if (!course || !roster) return

    try {
      const host = getRendererHost()
      const target = await host.pickSaveTarget({
        suggestedName: `students.${format}`,
      })
      if (!target) return

      const client = getWorkflowClient()
      await client.run("roster.exportMembers", {
        course,
        target,
        format,
      })
    } catch (err) {
      const message = getErrorMessage(err)
      addToast(`Export failed: ${message}`, { tone: "error" })
    }
  }

  if (!course) {
    return <NoCourseEmptyState tabLabel="the roster" />
  }

  return (
    <MemberListPane
      roster={roster}
      importing={false}
      canImportFromLms={canImportFromLms}
      lmsImportTooltip={lmsImportTooltip}
      hasLmsConnection={hasLmsConnection}
      onImportFromLms={() => setRosterSyncDialogOpen(true)}
      onImportFromFile={() => setImportFileDialogOpen(true)}
      onImportGitUsernames={() => setImportGitUsernamesDialogOpen(true)}
      onVerifyGitUsernames={() => setUsernameVerificationDialogOpen(true)}
      onClear={handleClear}
      onExport={(format) => void handleExport(format)}
    />
  )
}
