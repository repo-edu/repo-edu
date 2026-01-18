/**
 * CourseDisplay - Shows the profile's course with verification status and action button.
 * Read-only display (course is set at profile creation and cannot be changed).
 */

import { Button } from "@repo-edu/ui"
import {
  AlertCircle,
  Check,
  HelpCircle,
  Loader2,
  RefreshCw,
} from "@repo-edu/ui/components/icons"
import { commands } from "../bindings/commands"
import { useAppSettingsStore } from "../stores/appSettingsStore"
import {
  selectCourseError,
  selectCourseStatus,
  useConnectionsStore,
} from "../stores/connectionsStore"
import { useOutputStore } from "../stores/outputStore"
import { selectCourse, useProfileStore } from "../stores/profileStore"
import { useUiStore } from "../stores/uiStore"

export function CourseDisplay() {
  const course = useProfileStore(selectCourse)
  const setCourse = useProfileStore((state) => state.setCourse)
  const setCourseVerifiedAt = useProfileStore(
    (state) => state.setCourseVerifiedAt,
  )
  const lmsConnection = useAppSettingsStore((state) => state.lmsConnection)
  const courseStatus = useConnectionsStore(selectCourseStatus)
  const courseError = useConnectionsStore(selectCourseError)
  const setCourseStatus = useConnectionsStore((state) => state.setCourseStatus)
  const activeProfile = useUiStore((state) => state.activeProfile)
  const appendOutput = useOutputStore((state) => state.appendText)

  const hasLmsConnection = lmsConnection !== null
  const hasCourseId = course.id.trim() !== ""
  const isVerifying = courseStatus === "verifying"
  const canVerify = hasLmsConnection && hasCourseId && !isVerifying

  const handleVerify = async () => {
    if (!activeProfile || !canVerify) return

    setCourseStatus(activeProfile, "verifying")

    try {
      const result = await commands.verifyProfileCourse(activeProfile)

      if (result.status === "error") {
        setCourseStatus(activeProfile, "failed", result.error.message)
        appendOutput(
          `Course verification failed: ${result.error.message}`,
          "error",
        )
        return
      }

      const { success, message, updated_name } = result.data

      if (!success) {
        setCourseStatus(activeProfile, "failed", message)
        appendOutput(`Course verification failed: ${message}`, "error")
        return
      }

      // Update course name if changed (marks profile dirty)
      if (updated_name && updated_name !== course.name) {
        setCourse({ id: course.id, name: updated_name })
        appendOutput(`Course name updated: ${updated_name}`, "info")
      }

      setCourseStatus(activeProfile, "verified")
      setCourseVerifiedAt(new Date().toISOString())
      appendOutput("Course verified", "success")
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setCourseStatus(activeProfile, "failed", message)
      appendOutput(`Course verification failed: ${message}`, "error")
    }
  }

  // Format course display
  const courseDisplay = hasCourseId
    ? course.name
      ? `${course.id} — ${course.name}`
      : course.id
    : "No course configured"

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span>Course:</span>
        <span>{courseDisplay}</span>
        <CourseStatusIcon status={courseStatus} />
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2"
          disabled={!canVerify}
          onClick={handleVerify}
          title={
            !hasLmsConnection
              ? "Configure LMS connection first"
              : !hasCourseId
                ? "No course ID configured"
                : isVerifying
                  ? "Verifying..."
                  : courseStatus === "verified"
                    ? "Re-verify course"
                    : "Verify course"
          }
        >
          <RefreshCw className="size-3 mr-1" />
          {isVerifying
            ? "Verifying..."
            : courseStatus === "verified"
              ? "Re-verify"
              : "Verify"}
        </Button>
      </div>
      {courseStatus === "failed" && courseError && (
        <div className="text-xs text-destructive ml-14">{courseError}</div>
      )}
    </div>
  )
}

function CourseStatusIcon({
  status,
}: {
  status: "unknown" | "verifying" | "verified" | "failed"
}) {
  switch (status) {
    case "verified":
      return (
        <span title="Course verified in LMS">
          <Check className="size-4 text-success" aria-label="Verified" />
        </span>
      )
    case "verifying":
      return <Loader2 className="size-4 animate-spin" aria-label="Verifying" />
    case "failed":
      return (
        <span title="Course verification failed. Click Re-verify to try again.">
          <AlertCircle
            className="size-4 text-destructive"
            aria-label="Verification failed"
          />
        </span>
      )
    default:
      return (
        <span title="Course not verified. Click Verify to check if this course exists in your LMS.">
          <HelpCircle className="size-4" aria-label="Not verified" />
        </span>
      )
  }
}
