import type { Roster } from "@repo-edu/domain"
import { getRendererHost } from "../../contexts/renderer-host.js"
import { getWorkflowClient } from "../../contexts/workflow-client.js"
import {
  selectCourseId,
  selectLmsConnectionName,
  selectRoster,
  useProfileStore,
} from "../../stores/profile-store.js"
import { useToastStore } from "../../stores/toast-store.js"
import { useUiStore } from "../../stores/ui-store.js"
import { getErrorMessage } from "../../utils/error-message.js"
import { NoProfileEmptyState } from "../NoProfileEmptyState.js"
import { MemberListPane } from "./roster/MemberListPane.js"

type RosterTabProps = {
  isDirty: boolean
}

export function RosterTab({ isDirty: _isDirty }: RosterTabProps) {
  const roster = useProfileStore(selectRoster)
  const profile = useProfileStore((s) => s.profile)
  const setRoster = useProfileStore((s) => s.setRoster)
  const activeProfileId = useUiStore((s) => s.activeProfileId)
  const lmsConnectionName = useProfileStore(selectLmsConnectionName)
  const courseId = useProfileStore(selectCourseId)
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
      ? "No course configured for this profile"
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
    if (!activeProfileId || !roster) return

    try {
      const host = getRendererHost()
      const target = await host.pickSaveTarget({
        suggestedName: `students.${format}`,
      })
      if (!target) return

      const client = getWorkflowClient()
      await client.run("roster.exportMembers", {
        profileId: activeProfileId,
        target,
        format,
      })
    } catch (err) {
      const message = getErrorMessage(err)
      addToast(`Export failed: ${message}`, { tone: "error" })
    }
  }

  if (!activeProfileId || !profile) {
    return <NoProfileEmptyState tabLabel="the roster" />
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
