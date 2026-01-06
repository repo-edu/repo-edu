/**
 * StudentEditorSheet - View and edit students in the roster
 */

import {
  Button,
  Input,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@repo-edu/ui"
import { Plus, Search, Trash2, X } from "@repo-edu/ui/components/icons"
import { useMemo, useState } from "react"
import { commands } from "../../bindings/commands"
import type { Student, StudentId } from "../../bindings/types"
import { useOutputStore } from "../../stores/outputStore"
import { useRosterStore } from "../../stores/rosterStore"
import { useUiStore } from "../../stores/uiStore"
import { generateStudentId } from "../../utils/nanoid"

export function StudentEditorSheet() {
  const studentEditorOpen = useUiStore((state) => state.studentEditorOpen)
  const setStudentEditorOpen = useUiStore((state) => state.setStudentEditorOpen)

  const roster = useRosterStore((state) => state.roster)
  const rosterValidation = useRosterStore((state) => state.rosterValidation)
  const addStudent = useRosterStore((state) => state.addStudent)
  const updateStudent = useRosterStore((state) => state.updateStudent)
  const removeStudent = useRosterStore((state) => state.removeStudent)

  const [searchQuery, setSearchQuery] = useState("")
  const [addingStudent, setAddingStudent] = useState(false)
  const [newStudentName, setNewStudentName] = useState("")
  const [newStudentEmail, setNewStudentEmail] = useState("")

  const students = roster?.students ?? []

  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return students
    const query = searchQuery.toLowerCase()
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.email.toLowerCase().includes(query) ||
        s.git_username?.toLowerCase().includes(query),
    )
  }, [students, searchQuery])

  const handleAddStudent = () => {
    if (!newStudentName.trim() || !newStudentEmail.trim()) return

    const student: Student = {
      id: generateStudentId(),
      name: newStudentName.trim(),
      email: newStudentEmail.trim(),
      student_number: null,
      git_username: null,
      git_username_status: "unknown",
      lms_user_id: null,
      custom_fields: {},
    }

    addStudent(student)
    setNewStudentName("")
    setNewStudentEmail("")
    setAddingStudent(false)
  }

  const handleUpdateName = (id: StudentId, name: string) => {
    updateStudent(id, { name })
  }

  const handleUpdateEmail = (id: StudentId, email: string) => {
    updateStudent(id, { email })
  }

  const handleUpdateGitUsername = (id: StudentId, git_username: string) => {
    updateStudent(id, {
      git_username: git_username || null,
      git_username_status: "unknown",
    })
  }

  const setStudentRemovalConfirmation = useUiStore(
    (state) => state.setStudentRemovalConfirmation,
  )
  const activeProfile = useUiStore((state) => state.activeProfile)
  const appendOutput = useOutputStore((state) => state.appendText)

  const handleRemoveStudent = async (id: StudentId) => {
    if (!activeProfile || !roster) return

    try {
      const result = await commands.checkStudentRemoval(
        activeProfile,
        roster,
        id,
      )
      if (result.status === "error") {
        appendOutput(
          `Failed to check student removal: ${result.error.message}`,
          "error",
        )
        return
      }

      const check = result.data
      if (check.affected_groups.length > 0) {
        // Student is in groups, show confirmation dialog
        setStudentRemovalConfirmation(check)
      } else {
        // Student not in any groups, remove directly
        removeStudent(id)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendOutput(`Failed to check student removal: ${message}`, "error")
    }
  }

  const issueCount = rosterValidation?.issues.length ?? 0

  return (
    <Sheet open={studentEditorOpen} onOpenChange={setStudentEditorOpen}>
      <SheetContent className="w-full sm:max-w-3xl flex flex-col">
        <SheetHeader>
          <SheetTitle>Students</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 mt-4 h-full">
          {/* Search and Add */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 size-4" />
              <Input
                placeholder="Search students..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button size="sm" onClick={() => setAddingStudent(true)}>
              <Plus className="size-4 mr-1" />
              Add Student
            </Button>
          </div>

          {/* Add student form */}
          {addingStudent && (
            <div className="flex gap-2 items-center p-2 bg-muted rounded">
              <Input
                placeholder="Name"
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
                className="flex-1"
              />
              <Input
                placeholder="Email"
                value={newStudentEmail}
                onChange={(e) => setNewStudentEmail(e.target.value)}
                className="flex-1"
              />
              <Button
                size="sm"
                onClick={handleAddStudent}
                disabled={!newStudentName.trim() || !newStudentEmail.trim()}
              >
                Add
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAddingStudent(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
          )}

          {/* Student table */}
          <div className="border rounded flex-1 min-h-0 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-left p-2 font-medium">Name</th>
                  <th className="text-left p-2 font-medium">Email</th>
                  <th className="text-left p-2 font-medium">Git Username</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => (
                  <StudentRow
                    key={student.id}
                    student={student}
                    onUpdateName={(name) => handleUpdateName(student.id, name)}
                    onUpdateEmail={(email) =>
                      handleUpdateEmail(student.id, email)
                    }
                    onUpdateGitUsername={(username) =>
                      handleUpdateGitUsername(student.id, username)
                    }
                    onRemove={() => handleRemoveStudent(student.id)}
                  />
                ))}
                {filteredStudents.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="p-4 text-center text-muted-foreground"
                    >
                      {searchQuery
                        ? "No students match search"
                        : "No students in roster"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Footer summary */}
          <div>
            {students.length} students
            {issueCount > 0 && (
              <span className="text-warning ml-2">• {issueCount} issues</span>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

interface StudentRowProps {
  student: Student
  onUpdateName: (name: string) => void
  onUpdateEmail: (email: string) => void
  onUpdateGitUsername: (username: string) => void
  onRemove: () => void
}

function StudentRow({
  student,
  onUpdateName,
  onUpdateEmail,
  onUpdateGitUsername,
  onRemove,
}: StudentRowProps) {
  const [editingField, setEditingField] = useState<string | null>(null)

  const statusIcon = getStatusIcon(student.git_username_status)

  return (
    <tr className="border-t hover:bg-muted/50">
      <td className="p-2">
        {editingField === "name" ? (
          <Input
            defaultValue={student.name}
            onBlur={(e) => {
              onUpdateName(e.target.value)
              setEditingField(null)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onUpdateName(e.currentTarget.value)
                setEditingField(null)
              }
              if (e.key === "Escape") setEditingField(null)
            }}
            autoFocus
            className="h-7"
          />
        ) : (
          <button
            type="button"
            className="bg-transparent border-none p-0 font-normal cursor-pointer hover:underline text-left"
            onClick={() => setEditingField("name")}
          >
            {student.name}
          </button>
        )}
      </td>
      <td className="p-2">
        {editingField === "email" ? (
          <Input
            defaultValue={student.email}
            onBlur={(e) => {
              onUpdateEmail(e.target.value)
              setEditingField(null)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onUpdateEmail(e.currentTarget.value)
                setEditingField(null)
              }
              if (e.key === "Escape") setEditingField(null)
            }}
            autoFocus
            className="h-7"
          />
        ) : (
          <button
            type="button"
            className="bg-transparent border-none p-0 font-normal cursor-pointer hover:underline text-left"
            onClick={() => setEditingField("email")}
          >
            {student.email || <span className="text-muted-foreground">—</span>}
          </button>
        )}
      </td>
      <td className="p-2">
        {editingField === "git_username" ? (
          <Input
            defaultValue={student.git_username ?? ""}
            onBlur={(e) => {
              onUpdateGitUsername(e.target.value)
              setEditingField(null)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onUpdateGitUsername(e.currentTarget.value)
                setEditingField(null)
              }
              if (e.key === "Escape") setEditingField(null)
            }}
            autoFocus
            className="h-7"
          />
        ) : (
          <button
            type="button"
            className="bg-transparent border-none p-0 font-normal cursor-pointer hover:underline flex items-center gap-1 text-left"
            onClick={() => setEditingField("git_username")}
          >
            {student.git_username || (
              <span className="text-muted-foreground">—</span>
            )}
            {statusIcon}
          </button>
        )}
      </td>
      <td className="p-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={onRemove}
          className="h-7 w-7 p-0"
        >
          <Trash2 className="size-4 hover:text-destructive" />
        </Button>
      </td>
    </tr>
  )
}

function getStatusIcon(status: Student["git_username_status"]) {
  switch (status) {
    case "valid":
      return <span className="text-success">✓</span>
    case "invalid":
      return <span className="text-destructive">✗</span>
    default:
      return null
  }
}
