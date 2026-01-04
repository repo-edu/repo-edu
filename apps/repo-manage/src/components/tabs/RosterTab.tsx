/**
 * RosterTab - displays course info, roster source, student count, and actions.
 */

import { Button } from "@repo-edu/ui"
import { useProfileSettingsStore } from "../../stores/profileSettingsStore"
import { useRosterStore } from "../../stores/rosterStore"

export function RosterTab() {
  const roster = useRosterStore((state) => state.roster)
  const rosterValidation = useRosterStore((state) => state.rosterValidation)
  const course = useProfileSettingsStore((state) => state.course)
  const status = useRosterStore((state) => state.status)

  // Empty state
  if (!roster || roster.students.length === 0) {
    return <RosterEmptyState />
  }

  const studentCount = roster.students.length
  const issueCount = rosterValidation?.issues.length ?? 0

  // Get timestamp from source
  const getSourceTimestamp = () => {
    if (!roster.source) return null
    return (
      roster.source.fetched_at ??
      roster.source.imported_at ??
      roster.source.created_at
    )
  }
  const timestamp = getSourceTimestamp()

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Course display */}
      {course.name && (
        <div className="text-sm">
          <span className="text-muted-foreground">Course:</span>{" "}
          <span className="font-medium">
            {course.id} {course.name}
          </span>
        </div>
      )}

      {/* Roster source */}
      {roster.source && (
        <div className="text-sm text-muted-foreground">
          Source: {roster.source.kind}
          {timestamp && (
            <span>
              {" "}
              - Last imported: {new Date(timestamp).toLocaleString()}
            </span>
          )}
        </div>
      )}

      {/* Student count + issues */}
      <div className="text-sm">
        <span className="font-medium">{studentCount} students</span>
        {issueCount > 0 && (
          <span className="text-yellow-600 ml-2">
            {issueCount} issue{issueCount > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Action buttons - placeholder */}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled>
          Import
        </Button>
        <Button size="sm" variant="outline" disabled>
          View/Edit
        </Button>
        <Button size="sm" variant="outline" disabled>
          Coverage
        </Button>
        <Button size="sm" variant="outline" disabled>
          Export
        </Button>
        <Button size="sm" variant="outline" disabled>
          Clear
        </Button>
      </div>

      {status === "loading" && (
        <div className="text-sm text-muted-foreground">Loading...</div>
      )}
    </div>
  )
}

function RosterEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-muted-foreground">No students in roster</p>
      <div className="flex gap-2">
        <Button size="sm" disabled>
          Import from LMS
        </Button>
        <Button size="sm" variant="outline" disabled>
          Import from File
        </Button>
        <Button size="sm" variant="outline" disabled>
          Add Student Manually
        </Button>
      </div>
    </div>
  )
}
