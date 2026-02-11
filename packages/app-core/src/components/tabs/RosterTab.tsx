/**
 * RosterTab - roster management with master-detail layout.
 * Left sidebar shows profiles, main body shows students for active profile.
 */

import { Button, EmptyState } from "@repo-edu/ui"
import { commands } from "../../bindings/commands"
import { useProfiles } from "../../hooks/useProfiles"
import { saveDialog } from "../../services/platform"
import { useAppSettingsStore } from "../../stores/appSettingsStore"
import {
  selectCourseStatus,
  useConnectionsStore,
} from "../../stores/connectionsStore"
import { useOutputStore } from "../../stores/outputStore"
import { selectCourse, useProfileStore } from "../../stores/profileStore"
import { useToastStore } from "../../stores/toastStore"
import { useUiStore } from "../../stores/uiStore"
import { MemberListPane, ProfileSidebar } from "./roster"

interface RosterTabProps {
  isDirty: boolean
}

export function RosterTab({ isDirty }: RosterTabProps) {
  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const setRoster = useProfileStore((state) => state.setRoster)
  const course = useProfileStore(selectCourse)
  const activeProfile = useUiStore((state) => state.activeProfile)
  const lmsConnection = useAppSettingsStore((state) => state.lmsConnection)
  const courseStatus = useConnectionsStore(selectCourseStatus)
  const appendOutput = useOutputStore((state) => state.appendText)
  const addToast = useToastStore((state) => state.addToast)

  // Dialog/sheet openers
  const setNewProfileDialogOpen = useUiStore(
    (state) => state.setNewProfileDialogOpen,
  )
  const setImportFileDialogOpen = useUiStore(
    (state) => state.setImportFileDialogOpen,
  )
  const setRosterSyncDialogOpen = useUiStore(
    (state) => state.setRosterSyncDialogOpen,
  )

  // Profile management hook
  const {
    profiles,
    switchProfile,
    duplicateProfile,
    renameProfile,
    deleteProfile,
  } = useProfiles()

  // LMS import state
  const hasLmsConnection = lmsConnection !== null
  const hasCourseId = course.id.trim() !== ""
  const canImportFromLms =
    hasLmsConnection && hasCourseId && courseStatus !== "failed"

  const lmsImportTooltip = !hasLmsConnection
    ? "Configure an LMS connection in Settings first"
    : !hasCourseId
      ? "No course configured for this profile"
      : courseStatus === "failed"
        ? "Course verification failed - check Settings"
        : "Sync roster from LMS (students and staff)"

  const handleClear = () => {
    if (!roster?.students.length) return
    setRoster(
      {
        connection: null,
        students: [],
        staff: [],
        groups: [],
        group_sets: [],
        assignments: [],
      },
      "Clear roster",
    )
    addToast("Roster cleared. Ctrl+Z to undo", { tone: "warning" })
  }

  const handleExportStudents = async (format: "csv" | "xlsx") => {
    if (!roster) return

    try {
      const path = await saveDialog({
        defaultPath: `students.${format}`,
        filters: [
          {
            name: format === "csv" ? "CSV files" : "Excel files",
            extensions: [format],
          },
        ],
      })

      if (!path) return

      const result = await commands.exportStudents(roster, path)
      if (result.status === "ok") {
        appendOutput(`Students exported to ${path}`, "success")
      } else {
        appendOutput(`Export failed: ${result.error.message}`, "error")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendOutput(`Export failed: ${message}`, "error")
    }
  }

  // Empty state (no profile selected)
  if (!activeProfile) {
    return (
      <EmptyState message="No profile selected">
        <Button onClick={() => setNewProfileDialogOpen(true)}>
          Create Profile
        </Button>
      </EmptyState>
    )
  }

  return (
    <div className="flex h-full">
      {/* Left sidebar - Profile list */}
      <ProfileSidebar
        profiles={profiles}
        activeProfile={activeProfile}
        isDirty={isDirty}
        onSelect={switchProfile}
        onNew={() => setNewProfileDialogOpen(true)}
        onDuplicate={duplicateProfile}
        onRename={renameProfile}
        onDelete={deleteProfile}
      />

      {/* Main body - Student list */}
      <MemberListPane
        roster={roster}
        importing={false}
        canImportFromLms={canImportFromLms}
        lmsImportTooltip={lmsImportTooltip}
        hasLmsConnection={hasLmsConnection}
        onImportFromLms={() => setRosterSyncDialogOpen(true)}
        onImportFromFile={() => setImportFileDialogOpen(true)}
        onClear={handleClear}
        onExport={handleExportStudents}
      />
    </div>
  )
}
