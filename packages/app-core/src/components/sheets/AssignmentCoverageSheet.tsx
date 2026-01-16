import type { StudentId } from "@repo-edu/backend-interface/types"
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@repo-edu/ui"
import { AlertTriangle } from "@repo-edu/ui/components/icons"
import { useMemo } from "react"
import { useProfileStore } from "../../stores/profileStore"
import { useUiStore } from "../../stores/uiStore"
import { formatStudentStatus } from "../../utils/labels"
import { generateGroupId } from "../../utils/nanoid"
import {
  buildStudentMap,
  getAssignmentCoverageSummary,
} from "../../utils/rosterMetrics"

export function AssignmentCoverageSheet() {
  const open = useUiStore((state) => state.assignmentCoverageOpen)
  const focus = useUiStore((state) => state.assignmentCoverageFocus)
  const setOpen = useUiStore((state) => state.setAssignmentCoverageOpen)
  const setFocus = useUiStore((state) => state.setAssignmentCoverageFocus)
  const setDataOverviewOpen = useUiStore((state) => state.setDataOverviewOpen)

  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const selectedAssignmentId = useProfileStore(
    (state) => state.selectedAssignmentId,
  )
  const addGroup = useProfileStore((state) => state.addGroup)
  const updateGroup = useProfileStore((state) => state.updateGroup)

  const assignment = roster?.assignments.find(
    (entry) => entry.id === selectedAssignmentId,
  )
  const students = roster?.students ?? []
  const studentMap = useMemo(() => buildStudentMap(students), [students])

  const coverage = assignment
    ? getAssignmentCoverageSummary(assignment, students)
    : null

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setFocus(null)
    }
  }

  const handleAddToGroup = (groupId: string, studentId: StudentId) => {
    if (!assignment) return
    const group = assignment.groups.find((entry) => entry.id === groupId)
    if (!group || group.member_ids.includes(studentId)) return
    updateGroup(assignment.id, group.id, {
      member_ids: [...group.member_ids, studentId],
    })
  }

  const handleAddNewGroup = (studentId: StudentId) => {
    if (!assignment) return
    const groupName = `Group ${assignment.groups.length + 1}`
    addGroup(assignment.id, {
      id: generateGroupId(),
      name: groupName,
      member_ids: [studentId],
    })
  }

  if (!assignment || !coverage) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent className="w-full sm:max-w-xl bg-background">
          <SheetHeader>
            <SheetTitle>Assignment Coverage</SheetTitle>
          </SheetHeader>
          <div className="mt-4 text-sm text-muted-foreground">
            Select an assignment to view coverage.
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-xl bg-background">
        <SheetHeader>
          <SheetTitle>{assignment.name} Coverage</SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-4">
          <button
            type="button"
            className="text-left text-xs text-primary hover:underline"
            onClick={() => setDataOverviewOpen(true)}
          >
            Back to Data Overview
          </button>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              {coverage.assignedActiveCount}/{coverage.activeCount} active
              students assigned
            </span>
            {assignment.assignment_type === "class_wide" &&
              coverage.unassignedActiveStudents.length > 0 && (
                <span className="inline-flex items-center gap-1 text-warning">
                  <AlertTriangle className="size-3" />
                  {coverage.unassignedActiveStudents.length} unassigned
                </span>
              )}
          </div>

          {assignment.assignment_type === "class_wide" && (
            <section
              className={`rounded-md border px-3 py-2 ${
                focus === "unassigned" ? "border-warning/60" : "border-border"
              }`}
            >
              <div className="font-medium text-sm">Unassigned students</div>
              {coverage.unassignedActiveStudents.length === 0 ? (
                <div className="text-xs text-muted-foreground mt-1">
                  All active students are assigned.
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  {coverage.unassignedActiveStudents.map((student) => (
                    <div
                      key={student.id}
                      className="flex flex-col gap-2 rounded-md border border-dashed px-2 py-2"
                    >
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span>{student.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatStudentStatus(student.status)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAddNewGroup(student.id)}
                        >
                          Add to new group
                        </Button>
                        {assignment.groups.length > 0 && (
                          <Select
                            onValueChange={(groupId) =>
                              handleAddToGroup(groupId, student.id)
                            }
                          >
                            <SelectTrigger className="h-8 w-44">
                              <span className="text-xs text-muted-foreground">
                                Add to existing
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              {assignment.groups.map((group) => (
                                <SelectItem key={group.id} value={group.id}>
                                  {group.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="space-y-2">
            <div className="text-sm font-medium">Assigned groups</div>
            {assignment.groups.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                No groups yet.
              </div>
            ) : (
              assignment.groups.map((group) => {
                const members = group.member_ids.map((memberId) => {
                  const student = studentMap.get(memberId)
                  if (!student) {
                    return {
                      id: memberId,
                      label: `Unknown (${memberId})`,
                      status: null,
                    }
                  }
                  return {
                    id: student.id,
                    label: student.name,
                    status: student.status,
                  }
                })

                return (
                  <div key={group.id} className="rounded-md border px-3 py-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{group.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {members.length} member{members.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {members.length === 0 ? (
                        <span>No members</span>
                      ) : (
                        members.map((member) => (
                          <span
                            key={member.id}
                            className={
                              member.status && member.status !== "active"
                                ? "rounded bg-muted px-1"
                                : ""
                            }
                          >
                            {member.label}
                            {member.status && member.status !== "active"
                              ? ` (${formatStudentStatus(member.status)})`
                              : ""}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
