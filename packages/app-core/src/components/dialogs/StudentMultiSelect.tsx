/**
 * Multi-select component for choosing students (group members).
 */

import type { Student, StudentId } from "@repo-edu/backend-interface/types"
import { Checkbox, Input } from "@repo-edu/ui"
import { useMemo, useState } from "react"

interface StudentMultiSelectProps {
  students: Student[]
  selected: StudentId[]
  onChange: (selected: StudentId[]) => void
  groups?: { id: string; name: string; member_ids: StudentId[] }[]
  currentGroupId?: string | null
}

export function StudentMultiSelect({
  students,
  selected,
  onChange,
  groups,
  currentGroupId,
}: StudentMultiSelectProps) {
  const [search, setSearch] = useState("")

  const filteredStudents = useMemo(() => {
    const statusOrder: Record<Student["status"], number> = {
      active: 0,
      dropped: 1,
      incomplete: 2,
    }
    const sorted = [...students].sort((a, b) => {
      const statusDiff = statusOrder[a.status] - statusOrder[b.status]
      if (statusDiff !== 0) return statusDiff
      return a.name.localeCompare(b.name)
    })

    if (!search.trim()) return sorted
    const query = search.toLowerCase()
    return sorted.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.email.toLowerCase().includes(query) ||
        s.id.toLowerCase().includes(query) ||
        s.student_number?.toLowerCase().includes(query),
    )
  }, [students, search])

  const membershipMap = useMemo(() => {
    const map = new Map<StudentId, { groupId: string; groupName: string }[]>()
    if (!groups) return map
    for (const group of groups) {
      for (const memberId of group.member_ids) {
        const existing = map.get(memberId) ?? []
        existing.push({ groupId: group.id, groupName: group.name })
        map.set(memberId, existing)
      }
    }
    return map
  }, [groups])

  const toggleStudent = (id: StudentId) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id))
    } else {
      onChange([...selected, id])
    }
  }

  const selectAll = () => {
    const allIds = filteredStudents.map((s) => s.id)
    const newSelected = new Set([...selected, ...allIds])
    onChange(Array.from(newSelected))
  }

  const deselectAll = () => {
    const filteredIds = new Set(filteredStudents.map((s) => s.id))
    onChange(selected.filter((id) => !filteredIds.has(id)))
  }

  return (
    <div className="border rounded-md">
      <div className="p-2 border-b">
        <Input
          placeholder="Search students..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8"
        />
      </div>
      <div className="flex gap-2 px-2 py-1 border-b bg-muted/30">
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={selectAll}
        >
          Select all
        </button>
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={deselectAll}
        >
          Deselect all
        </button>
        <span className="text-xs text-muted-foreground ml-auto">
          {selected.length} selected
        </span>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {filteredStudents.length === 0 ? (
          <p className="text-sm text-muted-foreground p-3 text-center">
            {students.length === 0 ? "No students in roster" : "No matches"}
          </p>
        ) : (
          filteredStudents.map((student) => {
            const otherGroups = getOtherGroups(
              membershipMap,
              student.id,
              currentGroupId,
            )
            const highlightMultiGroup =
              otherGroups.length > 0 && !selected.includes(student.id)
            return (
              <div
                key={student.id}
                className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer ${
                  student.status !== "active" ? "text-muted-foreground" : ""
                } ${
                  highlightMultiGroup
                    ? "bg-warning-muted/40"
                    : "hover:bg-muted/50"
                }`}
                role="option"
                aria-selected={selected.includes(student.id)}
                onClick={() => toggleStudent(student.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    toggleStudent(student.id)
                  }
                }}
                tabIndex={0}
              >
                <Checkbox
                  checked={selected.includes(student.id)}
                  onCheckedChange={() => toggleStudent(student.id)}
                  tabIndex={-1}
                />
                <span className="text-sm flex-1">{student.name}</span>
                {student.status !== "active" && (
                  <span className="text-[10px] rounded bg-muted px-1 py-0.5">
                    {student.status === "dropped" ? "Dropped" : "Incomplete"}
                  </span>
                )}
                <span className="text-xs truncate max-w-32 text-muted-foreground">
                  {student.email}
                </span>
                <MultiGroupIndicator
                  membershipMap={membershipMap}
                  studentId={student.id}
                  currentGroupId={currentGroupId}
                />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function MultiGroupIndicator({
  membershipMap,
  studentId,
  currentGroupId,
}: {
  membershipMap: Map<StudentId, { groupId: string; groupName: string }[]>
  studentId: StudentId
  currentGroupId?: string | null
}) {
  const otherGroups = getOtherGroups(membershipMap, studentId, currentGroupId)
  if (otherGroups.length === 0) return null

  const preview = otherGroups.slice(0, 2).map((group) => group.groupName)
  const remainder = otherGroups.length - preview.length

  return (
    <span
      className="ml-auto text-xs text-warning"
      title={otherGroups.map((group) => group.groupName).join(", ")}
    >
      (also in {preview.join(", ")}
      {remainder > 0 ? ` and ${remainder} other` : ""})
    </span>
  )
}

function getOtherGroups(
  membershipMap: Map<StudentId, { groupId: string; groupName: string }[]>,
  studentId: StudentId,
  currentGroupId?: string | null,
) {
  const groups = membershipMap.get(studentId) ?? []
  return groups.filter((group) => group.groupId !== currentGroupId)
}
