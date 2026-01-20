/**
 * GroupsPane - Main body showing groups for the selected assignment.
 * Extracted from GroupEditorSheet to display inline in the Assignment tab.
 */

import type {
  Assignment,
  LmsGroupSetCacheEntry,
  Student,
} from "@repo-edu/backend-interface/types"
import { Button } from "@repo-edu/ui"
import { Copy } from "@repo-edu/ui/components/icons"
import { commands } from "../../../bindings/commands"
import { useAppSettingsStore } from "../../../stores/appSettingsStore"
import { useProfileStore } from "../../../stores/profileStore"
import { useToastStore } from "../../../stores/toastStore"
import { useUiStore } from "../../../stores/uiStore"
import { formatRelativeTime } from "../../../utils/relativeTime"
import { getAssignmentCoverageSummary } from "../../../utils/rosterMetrics"
import { GroupList } from "../../groups/GroupList"

interface GroupsPaneProps {
  assignment: Assignment | null
  groupSets: LmsGroupSetCacheEntry[]
  students: Student[]
  onFileImportExport: () => void
}

export function GroupsPane({
  assignment,
  groupSets,
  students,
  onFileImportExport,
}: GroupsPaneProps) {
  const setRoster = useProfileStore((state) => state.setRoster)
  const removeGroup = useProfileStore((state) => state.removeGroup)
  const duplicateGroupSetAsLocal = useProfileStore(
    (state) => state.duplicateGroupSetAsLocal,
  )
  const courseId = useProfileStore(
    (state) => state.document?.settings.course.id ?? "",
  )
  const assignmentSelection = useProfileStore(
    (state) => state.assignmentSelection,
  )
  const selectedAssignmentId = assignmentSelection?.id ?? null
  const setAddGroupDialogOpen = useUiStore(
    (state) => state.setAddGroupDialogOpen,
  )
  const setEditGroupDialogOpen = useUiStore(
    (state) => state.setEditGroupDialogOpen,
  )
  const setEditingGroupId = useUiStore((state) => state.setEditingGroupId)
  const lmsConnection = useAppSettingsStore((state) => state.lmsConnection)
  const addToast = useToastStore((state) => state.addToast)

  const groups = assignment?.groups ?? []
  const selectedGroupSet = assignment?.group_set_id
    ? groupSets.find((set) => set.id === assignment.group_set_id)
    : null
  const isReadOnly = selectedGroupSet?.kind === "linked"

  const handleBreakLink = async () => {
    if (!assignment || !selectedGroupSet) return
    if (!lmsConnection || !courseId.trim()) {
      addToast("No LMS connection or course configured", { tone: "error" })
      return
    }
    const contextResult = await commands.normalizeContext(
      lmsConnection.lms_type,
      lmsConnection.base_url,
      courseId,
    )
    if (contextResult.status !== "ok") {
      addToast(
        `Failed to resolve LMS context: ${contextResult.error.message}`,
        {
          tone: "error",
        },
      )
      return
    }

    const newGroupSetId = duplicateGroupSetAsLocal(
      selectedGroupSet.id,
      contextResult.data,
    )
    if (!newGroupSetId) return
    const updatedRoster = useProfileStore.getState().document?.roster
    if (!updatedRoster) return

    const result = await commands.attachGroupSetToAssignment(
      updatedRoster,
      assignment.id,
      newGroupSetId,
    )
    if (result.status === "ok") {
      setRoster(result.data, "Break group set link")
      addToast("Group set link broken; now editable", { tone: "success" })
    } else {
      addToast(`Failed to break link: ${result.error.message}`, {
        tone: "error",
      })
    }
  }

  const handleEditGroup = (groupId: string) => {
    if (isReadOnly) return
    setEditingGroupId(groupId)
    setEditGroupDialogOpen(true)
  }

  const handleRemoveGroup = (groupId: string) => {
    if (isReadOnly) return
    if (selectedAssignmentId) {
      removeGroup(selectedAssignmentId, groupId)
    }
  }

  // Calculate summary stats
  const totalStudents = groups.reduce((acc, g) => acc + g.member_ids.length, 0)
  const emptyGroupCount = groups.filter((g) => g.member_ids.length === 0).length
  const coverage = assignment
    ? getAssignmentCoverageSummary(assignment, students)
    : null

  if (!assignment) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Select an assignment to view groups
      </div>
    )
  }

  const groupSetTitle = selectedGroupSet
    ? selectedGroupSet.name
    : assignment.group_set_id
      ? "Unknown group set"
      : "Manual groups"
  const groupSetDetail = selectedGroupSet
    ? `${selectedGroupSet.kind === "linked" ? "Linked set" : selectedGroupSet.kind === "copied" ? "Copied set" : "Unlinked set"} · ${
        selectedGroupSet.fetched_at
          ? `synced ${formatRelativeTime(selectedGroupSet.fetched_at)}`
          : "never synced"
      }`
    : assignment.group_set_id
      ? "Group set not found in roster"
      : "Not linked"

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Group set header */}
      <div className="flex items-center justify-between px-3 h-11 pb-3 border-b">
        <div className="flex flex-col">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {groupSetTitle}
          </span>
          <span className="text-xs text-muted-foreground">
            {groupSetDetail}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {selectedGroupSet?.kind === "linked" && (
            <Button size="sm" variant="outline" onClick={handleBreakLink}>
              <Copy className="mr-2 size-4" />
              Break link
            </Button>
          )}
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-3 h-11 border-b">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Groups
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onFileImportExport}
            disabled={isReadOnly}
            title={isReadOnly ? "Linked groups are read-only" : undefined}
          >
            File Import/Export...
          </Button>
        </div>
      </div>

      {/* Search and Add */}
      <GroupList
        groups={groups.map((group) => ({
          id: group.id,
          name: group.name,
          memberIds: group.member_ids,
        }))}
        students={students}
        editable={!isReadOnly}
        onEditGroup={handleEditGroup}
        onRemoveGroup={handleRemoveGroup}
        onAddGroup={() => setAddGroupDialogOpen(true)}
        addDisabled={isReadOnly}
        addTitle={isReadOnly ? "Linked groups are read-only" : undefined}
        emptyMessage="No groups yet. Add groups or import from LMS when creating the assignment."
        noResultsMessage="No groups match your search."
      />

      {/* Footer */}
      <div className="px-3 py-2 border-t text-sm text-muted-foreground">
        {groups.length} group{groups.length !== 1 ? "s" : ""} · {totalStudents}{" "}
        student{totalStudents !== 1 ? "s" : ""}
        {emptyGroupCount > 0 && <span> · {emptyGroupCount} empty</span>}
        {coverage && (
          <span>
            {" "}
            · {coverage.assignedActiveCount}/{coverage.activeCount} active
            {assignment?.assignment_type === "class_wide" &&
              coverage.unassignedActiveStudents.length > 0 && (
                <span className="text-warning">
                  {" "}
                  · {coverage.unassignedActiveStudents.length} unassigned
                </span>
              )}
          </span>
        )}
      </div>
    </div>
  )
}
