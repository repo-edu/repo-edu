/**
 * MemberListPane - Main body showing student roster members for the active profile.
 * Includes course info, roster source, action buttons, and TanStack table editing.
 */

import type {
  Roster,
  RosterMember,
  RosterMemberId,
} from "@repo-edu/backend-interface/types"
import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
} from "@repo-edu/ui"
import {
  ChevronDown,
  Loader2,
  Plus,
  Search,
  X,
} from "@repo-edu/ui/components/icons"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  type Updater,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table"
import { useMemo, useState } from "react"
import { commands } from "../../../bindings/commands"
import { useAppSettingsStore } from "../../../stores/appSettingsStore"
import { useProfileStore } from "../../../stores/profileStore"
import { useToastStore } from "../../../stores/toastStore"
import { useUiStore } from "../../../stores/uiStore"
import { formatDate, formatDateTime } from "../../../utils/formatDate"
import { formatStudentStatus } from "../../../utils/labels"
import { generateStudentId } from "../../../utils/nanoid"
import { CourseDisplay } from "../../CourseDisplay"
import { SortHeaderButton } from "../../common/SortHeaderButton"
import { ActionCell } from "./cells/ActionCell"
import { EditableTextCell } from "./cells/EditableTextCell"
import { StatusDisplayCell } from "./cells/StatusDisplayCell"
import { StatusSelectCell } from "./cells/StatusSelectCell"

interface MemberListPaneProps {
  roster: Roster | null
  importing: boolean
  canImportFromLms: boolean
  lmsImportTooltip: string
  hasLmsConnection: boolean
  onImportFromLms: () => void
  onImportFromFile: () => void
  onClear: () => void
  onExport: (format: "csv" | "xlsx") => void
}

export function MemberListPane({
  roster,
  importing,
  canImportFromLms,
  lmsImportTooltip,
  hasLmsConnection,
  onImportFromLms,
  onImportFromFile,
  onClear,
  onExport,
}: MemberListPaneProps) {
  const openSettings = useUiStore((state) => state.openSettings)
  const activeProfile = useUiStore((state) => state.activeProfile)
  const rosterMemberColumnVisibility = useUiStore(
    (state) => state.rosterMemberColumnVisibility,
  )
  const setRosterMemberColumnVisibility = useUiStore(
    (state) => state.setRosterMemberColumnVisibility,
  )

  const addMember = useProfileStore((state) => state.addMember)
  const updateMember = useProfileStore((state) => state.updateMember)
  const removeMember = useProfileStore((state) => state.removeMember)
  const setStudentRemovalConfirmation = useUiStore(
    (state) => state.setStudentRemovalConfirmation,
  )
  const addToast = useToastStore((state) => state.addToast)

  const [globalFilter, setGlobalFilter] = useState("")
  const [sorting, setSorting] = useState<SortingState>([])
  const [showColumnControls, setShowColumnControls] = useState(false)
  const [addingStudent, setAddingStudent] = useState(false)
  const [newStudentName, setNewStudentName] = useState("")
  const [newStudentEmail, setNewStudentEmail] = useState("")

  const students = roster?.students ?? []
  const staff = roster?.staff ?? []
  const members = useMemo(() => [...students, ...staff], [students, staff])
  const studentCount = students.length
  const staffCount = staff.length
  const hasMembers = members.length > 0

  const handleAddStudent = () => {
    if (!newStudentName.trim() || !newStudentEmail.trim()) return

    const student: RosterMember = {
      id: generateStudentId(),
      name: newStudentName.trim(),
      email: newStudentEmail.trim(),
      student_number: null,
      git_username: null,
      git_username_status: "unknown",
      status: "active",
      lms_user_id: null,
      enrollment_type: "student",
      source: "local",
    }

    addMember(student)
    setNewStudentName("")
    setNewStudentEmail("")
    setAddingStudent(false)
  }

  const handleUpdateName = (id: RosterMemberId, name: string) => {
    updateMember(id, { name })
  }

  const handleUpdateEmail = (id: RosterMemberId, email: string) => {
    updateMember(id, { email })
  }

  const handleUpdateGitUsername = (
    id: RosterMemberId,
    git_username: string,
  ) => {
    updateMember(id, {
      git_username: git_username || null,
      git_username_status: "unknown",
    })
  }

  const handleUpdateStatus = (
    id: RosterMemberId,
    status: RosterMember["status"],
  ) => {
    updateMember(id, { status })
    const member = members.find((entry) => entry.id === id)
    if (!member) return
    if (status === "dropped" || status === "incomplete") {
      addToast(`${member.name} excluded from coverage`, {
        tone: "info",
      })
    }
  }

  const handleRemoveMember = async (id: RosterMemberId) => {
    if (!activeProfile || !roster) return

    try {
      const result = await commands.checkStudentRemoval(
        activeProfile,
        roster,
        id,
      )
      if (result.status === "error") {
        addToast(`Failed to check student removal: ${result.error.message}`, {
          tone: "error",
        })
        return
      }

      const check = result.data
      if (check.affected_groups.length > 0) {
        setStudentRemovalConfirmation(check)
      } else {
        removeMember(id)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      addToast(`Failed to check student removal: ${message}`, {
        tone: "error",
      })
    }
  }

  const memberTypeLabel = (member: RosterMember): string =>
    member.enrollment_type === "student" ? "Student" : "Staff"

  const columns = useMemo<ColumnDef<RosterMember>[]>(
    () => [
      {
        id: "name",
        accessorFn: (row) => row.name,
        header: ({ column }) => (
          <SortHeaderButton label="Name" column={column} />
        ),
        cell: ({ row }) => (
          <EditableTextCell
            value={row.original.name}
            onSave={(value) => handleUpdateName(row.original.id, value)}
            editable={row.original.source !== "lms"}
          />
        ),
      },
      {
        id: "email",
        accessorFn: (row) => row.email,
        header: ({ column }) => (
          <SortHeaderButton label="Email" column={column} />
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <EditableTextCell
              value={row.original.email}
              onSave={(value) => handleUpdateEmail(row.original.id, value)}
              editable={row.original.source !== "lms"}
              truncate
            />
          </div>
        ),
      },
      {
        id: "git_username",
        accessorFn: (row) => row.git_username ?? "",
        header: ({ column }) => (
          <SortHeaderButton label="Git Username" column={column} />
        ),
        cell: ({ row }) => (
          <EditableTextCell
            value={row.original.git_username ?? ""}
            onSave={(value) => handleUpdateGitUsername(row.original.id, value)}
            trailing={getStatusIcon(row.original.git_username_status)}
          />
        ),
      },
      {
        id: "status",
        accessorFn: (row) => row.status,
        header: ({ column }) => (
          <SortHeaderButton label="Status" column={column} />
        ),
        cell: ({ row }) =>
          row.original.source === "lms" ? (
            <StatusDisplayCell status={row.original.status} />
          ) : (
            <StatusSelectCell
              status={row.original.status}
              onChange={(status) => handleUpdateStatus(row.original.id, status)}
            />
          ),
      },
      {
        id: "member_type",
        accessorFn: (row) => memberTypeLabel(row),
        header: ({ column }) => (
          <SortHeaderButton label="Student/Staff" column={column} />
        ),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {memberTypeLabel(row.original)}
          </span>
        ),
      },
      {
        id: "actions",
        enableSorting: false,
        enableHiding: false,
        header: () => null,
        cell: ({ row }) => (
          <ActionCell onDelete={() => handleRemoveMember(row.original.id)} />
        ),
      },
    ],
    [
      handleRemoveMember,
      handleUpdateEmail,
      handleUpdateGitUsername,
      handleUpdateName,
      handleUpdateStatus,
    ],
  )

  const table = useReactTable({
    data: members,
    columns,
    state: {
      sorting,
      globalFilter,
      columnVisibility: rosterMemberColumnVisibility,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: (updater: Updater<VisibilityState>) => {
      const next =
        typeof updater === "function"
          ? updater(rosterMemberColumnVisibility)
          : updater
      setRosterMemberColumnVisibility(next)
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const query = String(filterValue ?? "")
        .trim()
        .toLowerCase()
      if (!query) return true
      const member = row.original
      return (
        member.name.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query) ||
        (member.git_username?.toLowerCase().includes(query) ?? false) ||
        formatStudentStatus(member.status).toLowerCase().includes(query) ||
        memberTypeLabel(member).toLowerCase().includes(query)
      )
    },
  })

  const hideableColumns = table
    .getAllLeafColumns()
    .filter((column) => column.getCanHide())

  return (
    <div className="flex-1 min-w-0 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 min-h-11 pb-3 border-b">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">
          Roster
        </span>
        <div className="ml-auto min-w-0 flex flex-wrap justify-end gap-2">
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
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAddingStudent(true)}
            title="Add a member manually"
          >
            <Plus className="size-4 mr-1" />
            Add
          </Button>
          {hasMembers && (
            <>
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
        <RosterSourceDisplay roster={roster} />
      </div>

      {/* Empty state or student list */}
      {!hasMembers ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-4 text-center">
          <p className="text-muted-foreground max-w-md">
            {hasLmsConnection
              ? "No roster members yet. Import from your LMS or a file, or add manually."
              : "Import a student roster from a CSV/Excel file, add manually, or configure an LMS connection to import directly."}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onImportFromLms}
              disabled={!canImportFromLms}
              title={lmsImportTooltip}
            >
              Import from LMS
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onImportFromFile}
              title="Import roster students from a CSV or Excel file."
            >
              Import from File
            </Button>
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
          {/* Search and table actions */}
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 size-4" />
              <Input
                placeholder="Search members..."
                value={globalFilter}
                onChange={(event) => setGlobalFilter(event.target.value)}
                className="pl-8"
              />
            </div>
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowColumnControls((current) => !current)}
              >
                Columns
              </Button>
              {showColumnControls && hideableColumns.length > 0 && (
                <div className="absolute right-0 top-9 z-10 bg-popover border rounded-md p-2 shadow-md min-w-44 space-y-1">
                  {hideableColumns.map((column) => (
                    <button
                      key={column.id}
                      type="button"
                      className="w-full inline-flex items-center gap-2 text-left text-xs px-1 py-1 rounded hover:bg-muted/50"
                      onClick={() => column.toggleVisibility()}
                    >
                      <Checkbox size="sm" checked={column.getIsVisible()} />
                      <span>{columnLabel(column.id)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
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
          <div className="flex-1 min-h-0 px-3 pb-2">
            <div className="border rounded h-full overflow-y-auto">
              <table className="w-full table-fixed text-sm">
                <thead className="bg-muted sticky top-0">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className={getHeaderCellClass(header.column.id)}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className={`border-t hover:bg-muted/50 ${
                        row.original.status !== "active"
                          ? "text-muted-foreground"
                          : ""
                      }`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className={getBodyCellClass(cell.column.id)}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {table.getRowModel().rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={table.getVisibleLeafColumns().length}
                        className="p-4 text-center text-muted-foreground"
                      >
                        {globalFilter
                          ? "No roster members match search"
                          : "No roster members"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer summary */}
          <div className="px-3 py-2 border-t text-sm text-muted-foreground">
            {studentCount} student{studentCount !== 1 ? "s" : ""} · {staffCount}{" "}
            staff
          </div>
        </>
      )}

      {/* Add student form for empty state */}
      {!hasMembers && addingStudent && (
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

  if (!roster?.connection) {
    return (
      <div className="flex items-center text-sm h-6">
        <span className="text-muted-foreground w-14 shrink-0">Source:</span>
        <span>None (local only)</span>
      </div>
    )
  }

  const { connection } = roster

  let sourceLabel: string
  switch (connection.kind) {
    case "canvas":
      sourceLabel = "LMS (Canvas)"
      break
    case "moodle":
      sourceLabel = "LMS (Moodle)"
      break
    case "import":
      sourceLabel = connection.source_filename
      break
  }

  const timestamp = connection.last_updated

  return (
    <div className="flex items-center text-sm h-6">
      <span className="text-muted-foreground w-14 shrink-0">Source:</span>
      <span>{sourceLabel}</span>
      {timestamp && (
        <span
          className="text-muted-foreground ml-1"
          title={formatDateTime(timestamp, dateFormat, timeFormat)}
        >
          {formatDate(timestamp, dateFormat)}
        </span>
      )}
    </div>
  )
}

function columnLabel(id: string): string {
  if (id === "name") return "Name"
  if (id === "email") return "Email"
  if (id === "git_username") return "Git Username"
  if (id === "status") return "Status"
  if (id === "member_type") return "Student/Staff"
  return id
}

function getStatusIcon(status: RosterMember["git_username_status"]) {
  switch (status) {
    case "valid":
      return <span className="text-success">✓</span>
    case "invalid":
      return <span className="text-destructive">✗</span>
    default:
      return null
  }
}

function getHeaderCellClass(columnId: string): string {
  const base = "p-2 text-left font-medium"
  if (columnId === "name") return `${base} w-[22%]`
  if (columnId === "email") return `${base} w-[30%] min-w-0`
  if (columnId === "git_username") return `${base} w-[18%]`
  if (columnId === "status") return `${base} w-[12%]`
  if (columnId === "member_type") return `${base} w-[14%]`
  if (columnId === "actions") return `${base} w-10`
  return base
}

function getBodyCellClass(columnId: string): string {
  const base = "p-2 align-top"
  if (columnId === "email") return `${base} min-w-0`
  return base
}
