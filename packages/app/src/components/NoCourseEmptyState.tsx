/**
 * NoCourseEmptyState — Shown in tab content when no course is active.
 * Distinguishes between "no courses exist" and "courses exist, none selected"
 * and provides contextual actions.
 */

import { Button, EmptyState } from "@repo-edu/ui"
import { Link } from "@repo-edu/ui/components/icons"
import {
  selectLmsConnections,
  useAppSettingsStore,
} from "../stores/app-settings-store.js"
import { useUiStore } from "../stores/ui-store.js"

type NoCourseEmptyStateProps = {
  /** Tab-specific noun shown in the "Select a course to view {tabLabel}." message. */
  tabLabel: string
}

export function NoCourseEmptyState({ tabLabel }: NoCourseEmptyStateProps) {
  const courses = useUiStore((s) => s.courseList)
  const setNewCourseDialogOpen = useUiStore((s) => s.setNewCourseDialogOpen)
  const openSettings = useUiStore((s) => s.openSettings)
  const lmsConnections = useAppSettingsStore(selectLmsConnections)

  const hasCourses = courses.length > 0
  const hasLmsConnection = lmsConnections.length > 0

  if (hasCourses) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState message={`Select a course to view ${tabLabel}.`} />
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center p-8">
      <EmptyState
        message={
          hasLmsConnection
            ? "Create a course to get started."
            : "Set up an LMS connection to import courses, or create a course manually."
        }
      >
        {!hasLmsConnection && (
          <Button onClick={() => openSettings("lms-connections")}>
            <Link className="size-4 mr-1" />
            Set Up LMS
          </Button>
        )}
        <Button variant="outline" onClick={() => setNewCourseDialogOpen(true)}>
          Create Course
        </Button>
      </EmptyState>
    </div>
  )
}
