/**
 * StudentListPane - Main body showing students for the active profile.
 * Includes course info, roster source, action buttons, and inline student editing.
 */

import type {
  Roster,
  Student,
  StudentId,
} from "@repo-edu/backend-interface/types"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@repo-edu/ui"
import {
  ChevronDown,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from "@repo-edu/ui/components/icons"
import { useMemo, useState } from "react"
import { commands } from "../../../bindings/commands"
import { useAppSettingsStore } from "../../../stores/appSettingsStore"
import { useOutputStore } from "../../../stores/outputStore"
import { useProfileStore } from "../../../stores/profileStore"
import { useToastStore } from "../../../stores/toastStore"
import { useUiStore } from "../../../stores/uiStore"
import { formatDateTime } from "../../../utils/formatDate"
import { formatStudentStatus } from "../../../utils/labels"
import { generateStudentId } from "../../../utils/nanoid"
import { CourseDisplay } from "../../CourseDisplay"

interface StudentListPaneProps {
  roster: Roster | null
  importing: boolean
  canImportFromLms: boolean
  lmsImportTooltip: string
  hasLmsConnection: boolean
  onImportFromLms: () => void
  onImportFromFile: () => void
  onCoverage: () => void
  onClear: () => void
  onExport: (format: "csv" | "xlsx") => void
}

export function StudentListPane({
  roster,
  importing,
  canImportFromLms,
  lmsImportTooltip,
  hasLmsConnection,
  onImportFromLms,
  onImportFromFile,
  onCoverage,
  onClear,
  onExport,
}: StudentListPaneProps) {
  const openSettings = useUiStore((state) => state.openSettings)
  const setNewProfileDialogOpen = useUiStore(
    (state) => state.setNewProfileDialogOpen,
  )
  const activeProfile = useUiStore((state) => state.activeProfile)

  const course = useProfileStore(
    (state) => state.document?.settings.course ?? null,
  )
  const addStudent = useProfileStore((state) => state.addStudent)
  const updateStudent = useProfileStore((state) => state.updateStudent)
  const removeStudent = useProfileStore((state) => state.removeStudent)
  const setStudentRemovalConfirmation = useUiStore(
    (state) => state.setStudentRemovalConfirmation,
  )
  const appendOutput = useOutputStore((state) => state.appendText)
  const addToast = useToastStore((state) => state.addToast)

  const [searchQuery, setSearchQuery] = useState("")
  const [addingStudent, setAddingStudent] = useState(false)
  const [newStudentName, setNewStudentName] = useState("")
  const [newStudentEmail, setNewStudentEmail] = useState("")

  const students = roster?.students ?? []
  const hasStudents = students.length > 0
  const hasCourseId = course?.id?.trim() !== ""

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
      status: "active",
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

  const handleUpdateStatus = (id: StudentId, status: Student["status"]) => {
    updateStudent(id, { status })
    const student = students.find((entry) => entry.id === id)
    if (!student) return
    if (status === "dropped" || status === "incomplete") {
      addToast(`${student.name} excluded from coverage`, {
        tone: "info",
      })
      return
    }
    if (status === "active") {
      const unassignedInClassWide =
        roster?.assignments.filter(
          (assignment) =>
            assignment.assignment_type === "class_wide" &&
            !assignment.groups.some((group) => group.member_ids.includes(id)),
        ) ?? []
      if (unassignedInClassWide.length > 0) {
        addToast(`${student.name} is now unassigned`, {
          tone: "warning",
        })
      }
    }
  }

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
        setStudentRemovalConfirmation(check)
      } else {
        removeStudent(id)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendOutput(`Failed to check student removal: ${message}`, "error")
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header - same height as ProfileSidebar header */}
      <div className="flex items-center justify-between px-3 h-11 pb-3 border-b">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Roster
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onImportFromLms}
            disabled={!canImportFromLms}
            title={lmsImportTooltip}
          >
            {importing ? (
              <>
                <Loader2 className="size-4 mr-1 animate-spin" />
                Importing...
              </>
            ) : (
              "Import from LMS"
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onImportFromFile}
            title="Import roster students from a CSV or Excel file."
          >
            Import from File
          </Button>
          {hasStudents && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={onCoverage}
                title="Shows if each student has a valid git account."
              >
                Coverage
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    title="Export the roster student list."
                  >
                    Export
                    <ChevronDown className="size-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onExport("csv")}>
                    Roster Students (CSV)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onExport("xlsx")}>
                    Roster Students (XLSX)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="sm"
                variant="outline"
                onClick={onClear}
                title="Remove all students, assignments, and git username mappings."
              >
                Clear
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Course info section */}
      <div className="px-3 py-2 border-b space-y-1">
        <CourseDisplay />
        {!hasCourseId && (
          <div className="text-sm text-muted-foreground">
            No course configured for this profile.{" "}
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 align-baseline"
              onClick={() => setNewProfileDialogOpen(true)}
            >
              Add the course for this profile
            </Button>
            .
          </div>
        )}
        <RosterSourceDisplay roster={roster} />
      </div>

      {/* Empty state or student list */}
      {!hasStudents ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-4 text-center">
          <p className="text-muted-foreground max-w-md">
            {hasLmsConnection
              ? "No students in roster. Import from your LMS or a file."
              : "Import a student roster from a CSV/Excel file, or configure an LMS connection in Settings to import directly."}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAddingStudent(true)}
            >
              Add Manually
            </Button>
          </div>
          {!hasLmsConnection && (
            <Button
              variant="link"
              size="sm"
              onClick={() => openSettings("connections")}
            >
              Configure LMS Connection
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Search and Add */}
          <div className="flex gap-2 px-3 py-2">
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
              Add
            </Button>
          </div>

          {/* Add student form */}
          {addingStudent && (
            <div className="flex gap-2 items-center px-3 py-2 bg-muted/50">
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
          <div className="flex-1 min-h-0 px-3 py-2">
            <div className="border rounded h-full overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium">Name</th>
                    <th className="text-left p-2 font-medium">Email</th>
                    <th className="text-left p-2 font-medium">Git Username</th>
                    <th className="text-left p-2 font-medium">Status</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student) => (
                    <StudentRow
                      key={student.id}
                      student={student}
                      onUpdateName={(name) =>
                        handleUpdateName(student.id, name)
                      }
                      onUpdateEmail={(email) =>
                        handleUpdateEmail(student.id, email)
                      }
                      onUpdateGitUsername={(username) =>
                        handleUpdateGitUsername(student.id, username)
                      }
                      onUpdateStatus={(status) =>
                        handleUpdateStatus(student.id, status)
                      }
                      onRemove={() => handleRemoveStudent(student.id)}
                    />
                  ))}
                  {filteredStudents.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
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
          </div>

          {/* Footer summary */}
          <div className="px-3 py-2 border-t text-sm text-muted-foreground">
            {students.length} student{students.length !== 1 ? "s" : ""}
          </div>
        </>
      )}

      {/* Add student form for empty state */}
      {!hasStudents && addingStudent && (
        <div className="flex gap-2 items-center px-3 py-2 bg-muted/50 border-t">
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
    </div>
  )
}

interface RosterSourceDisplayProps {
  roster: Roster | null
}

function RosterSourceDisplay({ roster }: RosterSourceDisplayProps) {
  const dateFormat = useAppSettingsStore((state) => state.dateFormat)
  const timeFormat = useAppSettingsStore((state) => state.timeFormat)

  if (!roster?.source) {
    return (
      <div className="text-sm">
        <span className="text-muted-foreground">Source:</span>{" "}
        <span>None (no roster loaded)</span>
      </div>
    )
  }

  const { source } = roster

  let sourceLabel: string
  switch (source.kind) {
    case "lms":
      sourceLabel = "LMS"
      break
    case "file":
      sourceLabel = source.file_name ?? "File"
      break
    case "manual":
      sourceLabel = "Manual entry"
      break
    default:
      sourceLabel = source.kind
  }

  const timestamp = source.fetched_at ?? source.imported_at ?? source.created_at

  return (
    <div className="text-sm">
      <span className="text-muted-foreground">Source:</span>{" "}
      <span>{sourceLabel}</span>
      {timestamp && (
        <span className="text-muted-foreground ml-1">
          ({formatDateTime(timestamp, dateFormat, timeFormat)})
        </span>
      )}
    </div>
  )
}

interface StudentRowProps {
  student: Student
  onUpdateName: (name: string) => void
  onUpdateEmail: (email: string) => void
  onUpdateGitUsername: (username: string) => void
  onUpdateStatus: (status: Student["status"]) => void
  onRemove: () => void
}

function StudentRow({
  student,
  onUpdateName,
  onUpdateEmail,
  onUpdateGitUsername,
  onUpdateStatus,
  onRemove,
}: StudentRowProps) {
  const [editingField, setEditingField] = useState<string | null>(null)

  const statusIcon = getStatusIcon(student.git_username_status)
  const isInactive = student.status !== "active"

  return (
    <tr
      className={`border-t hover:bg-muted/50 ${isInactive ? "text-muted-foreground" : ""}`}
    >
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
        <Select
          value={student.status}
          onValueChange={(value) => onUpdateStatus(value as Student["status"])}
        >
          <SelectTrigger className="h-7 w-32">
            <span className="text-sm">
              {formatStudentStatus(student.status)}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="dropped">Dropped</SelectItem>
            <SelectItem value="incomplete">Incomplete</SelectItem>
          </SelectContent>
        </Select>
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
