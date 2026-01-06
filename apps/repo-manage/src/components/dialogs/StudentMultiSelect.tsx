/**
 * Multi-select component for choosing students (group members).
 */

import { Checkbox, Input } from "@repo-edu/ui"
import { useMemo, useState } from "react"
import type { Student, StudentId } from "../../bindings/types"

interface StudentMultiSelectProps {
  students: Student[]
  selected: StudentId[]
  onChange: (selected: StudentId[]) => void
}

export function StudentMultiSelect({
  students,
  selected,
  onChange,
}: StudentMultiSelectProps) {
  const [search, setSearch] = useState("")

  const filteredStudents = useMemo(() => {
    if (!search.trim()) return students
    const query = search.toLowerCase()
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.email.toLowerCase().includes(query),
    )
  }, [students, search])

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
          filteredStudents.map((student) => (
            <div
              key={student.id}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer"
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
              <span className="text-xs truncate max-w-32">{student.email}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
