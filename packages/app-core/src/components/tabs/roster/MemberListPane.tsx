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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAppSettingsStore } from "../../../stores/appSettingsStore"
import { useProfileStore } from "../../../stores/profileStore"
import { useToastStore } from "../../../stores/toastStore"
import { useUiStore } from "../../../stores/uiStore"
import { formatDate, formatDateTime } from "../../../utils/formatDate"
import { formatStudentStatus } from "../../../utils/labels"
import { generateStudentId } from "../../../utils/nanoid"
import {
  chainComparisons,
  compareNullableText,
  compareNumber,
  compareText,
  getNextProgressiveSorting,
  normalizeProgressiveSorting,
} from "../../../utils/sorting"
import { CourseDisplay } from "../../CourseDisplay"
import { SortHeaderButton } from "../../common/SortHeaderButton"
import { EditableTextCell } from "./cells/EditableTextCell"
import { StatusCell } from "./cells/StatusSelectCell"

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
  const rosterColumnVisibility = useAppSettingsStore(
    (state) => state.rosterColumnVisibility,
  )
  const setRosterColumnVisibility = useAppSettingsStore(
    (state) => state.setRosterColumnVisibility,
  )
  const rosterColumnSizing = useAppSettingsStore(
    (state) => state.rosterColumnSizing,
  )
  const setRosterColumnSizing = useAppSettingsStore(
    (state) => state.setRosterColumnSizing,
  )
  const saveAppSettings = useAppSettingsStore((state) => state.save)

  const addMember = useProfileStore((state) => state.addMember)
  const deleteMemberPermanently = useProfileStore(
    (state) => state.deleteMemberPermanently,
  )
  const updateMember = useProfileStore((state) => state.updateMember)
  const addToast = useToastStore((state) => state.addToast)

  const [globalFilter, setGlobalFilter] = useState("")
  const [sorting, setSorting] = useState<SortingState>([])
  const [showColumnControls, setShowColumnControls] = useState(false)
  const [addingStudent, setAddingStudent] = useState(false)
  const [memberPendingDeletion, setMemberPendingDeletion] =
    useState<RosterMember | null>(null)
  const [newStudentName, setNewStudentName] = useState("")
  const [newStudentEmail, setNewStudentEmail] = useState("")

  const students = roster?.students ?? []
  const staff = roster?.staff ?? []
  const members = useMemo(() => [...students, ...staff], [students, staff])
  const studentCount = students.length
  const staffCount = staff.length
  const hasMembers = members.length > 0

  const memberGroupNames = useMemo(() => {
    const index = new Map<RosterMemberId, string[]>()
    if (!roster) return index

    const allMembers = [...roster.students, ...roster.staff]
    const activeIds = new Set(
      allMembers.filter((m) => m.status === "active").map((m) => m.id),
    )

    const systemGroupIds = new Set(
      roster.group_sets
        .filter((gs) => gs.connection?.kind === "system")
        .flatMap((gs) => gs.group_ids),
    )

    for (const group of roster.groups) {
      if (systemGroupIds.has(group.id)) continue
      for (const memberId of group.member_ids) {
        if (!activeIds.has(memberId)) continue
        let names = index.get(memberId)
        if (!names) {
          names = []
          index.set(memberId, names)
        }
        names.push(group.name)
      }
    }

    for (const names of index.values()) {
      names.sort((a, b) => a.localeCompare(b))
    }

    return index
  }, [roster])

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

  const handleRequestPermanentDelete = (id: RosterMemberId) => {
    const member = members.find((entry) => entry.id === id)
    if (!member || member.source !== "local") return
    setMemberPendingDeletion(member)
  }

  const handleConfirmPermanentDelete = () => {
    if (!memberPendingDeletion) return
    const { id, name } = memberPendingDeletion
    deleteMemberPermanently(id)
    addToast(`${name} deleted from roster`, { tone: "info" })
    setMemberPendingDeletion(null)
  }

  const memberTypeLabel = (member: RosterMember): string =>
    member.enrollment_type === "student" ? "Student" : "Staff"

  const handleSort = useCallback((columnId: string) => {
    setSorting((current) => getNextProgressiveSorting(current, columnId))
  }, [])

  const handleSortingChange = useCallback((updater: Updater<SortingState>) => {
    setSorting((current) =>
      normalizeProgressiveSorting(
        typeof updater === "function" ? updater(current) : updater,
      ),
    )
  }, [])

  const columns = useMemo<ColumnDef<RosterMember>[]>(
    () => [
      {
        id: "name",
        size: 200,
        minSize: 100,
        accessorFn: (row) => row.name,
        header: ({ column }) => (
          <SortHeaderButton
            label="Name"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => handleSort(column.id)}
          />
        ),
        sortingFn: compareRosterMemberNames,
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
        size: 260,
        minSize: 120,
        accessorFn: (row) => row.email,
        header: ({ column }) => (
          <SortHeaderButton
            label="Email"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => handleSort(column.id)}
          />
        ),
        sortingFn: compareRosterMemberEmails,
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
        id: "status",
        size: 110,
        minSize: 80,
        accessorFn: (row) => row.status,
        header: ({ column }) => (
          <SortHeaderButton
            label="Status"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => handleSort(column.id)}
          />
        ),
        sortingFn: compareRosterMemberStatuses,
        cell: ({ row }) => (
          <StatusCell
            status={row.original.status}
            lmsStatus={row.original.lms_status ?? null}
            source={row.original.source}
            onChange={(status) => handleUpdateStatus(row.original.id, status)}
            onDeletePermanent={() =>
              handleRequestPermanentDelete(row.original.id)
            }
          />
        ),
      },
      {
        id: "member_type",
        size: 90,
        minSize: 60,
        accessorFn: (row) => memberTypeLabel(row),
        header: ({ column }) => (
          <SortHeaderButton
            label="Role"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => handleSort(column.id)}
          />
        ),
        sortingFn: compareRosterMemberRoles,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {memberTypeLabel(row.original)}
          </span>
        ),
      },
      {
        id: "groups",
        size: 150,
        minSize: 80,
        accessorFn: (row) => memberGroupNames.get(row.id)?.join(", ") ?? "",
        header: ({ column }) => (
          <SortHeaderButton
            label="Groups"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => handleSort(column.id)}
          />
        ),
        sortingFn: (rowA, rowB) =>
          chainComparisons(
            compareText(
              memberGroupNames.get(rowA.original.id)?.join(", ") ?? "",
              memberGroupNames.get(rowB.original.id)?.join(", ") ?? "",
            ),
            compareRosterMembersByName(rowA.original, rowB.original),
          ),
        cell: ({ row }) => {
          const names = memberGroupNames.get(row.original.id)
          if (!names || names.length === 0) return null
          const text = names.join(", ")
          return (
            <span className="text-muted-foreground truncate block" title={text}>
              {text}
            </span>
          )
        },
      },
      {
        id: "git_username",
        size: 180,
        minSize: 100,
        accessorFn: (row) => row.git_username ?? "",
        header: ({ column }) => (
          <SortHeaderButton
            label="Git Username"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => handleSort(column.id)}
          />
        ),
        sortingFn: compareRosterMemberGitUsernames,
        cell: ({ row }) => (
          <EditableTextCell
            value={row.original.git_username ?? ""}
            onSave={(value) => handleUpdateGitUsername(row.original.id, value)}
            trailing={getStatusIcon(row.original.git_username_status)}
          />
        ),
      },
    ],
    [
      handleRequestPermanentDelete,
      handleUpdateEmail,
      handleUpdateGitUsername,
      handleUpdateName,
      handleUpdateStatus,
      handleSort,
      memberGroupNames,
    ],
  )

  const table = useReactTable({
    data: members,
    columns,
    columnResizeMode: "onChange",
    state: {
      sorting,
      globalFilter,
      columnVisibility: rosterColumnVisibility,
      columnSizing: rosterColumnSizing,
    },
    onSortingChange: handleSortingChange,
    onGlobalFilterChange: setGlobalFilter,
    onColumnSizingChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(rosterColumnSizing) : updater
      setRosterColumnSizing(next)
    },
    onColumnVisibilityChange: (updater: Updater<VisibilityState>) => {
      const next =
        typeof updater === "function"
          ? updater(rosterColumnVisibility)
          : updater
      setRosterColumnVisibility(next)
      saveAppSettings()
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
        memberTypeLabel(member).toLowerCase().includes(query) ||
        (memberGroupNames
          .get(member.id)
          ?.some((name) => name.toLowerCase().includes(query)) ??
          false)
      )
    },
  })

  // Save column sizing to app settings when a resize operation ends
  const isResizingColumn = table.getState().columnSizingInfo.isResizingColumn
  const prevIsResizingRef = useRef<string | false>(false)

  useEffect(() => {
    const wasResizing = prevIsResizingRef.current
    prevIsResizingRef.current = isResizingColumn
    if (wasResizing && !isResizingColumn) {
      saveAppSettings()
    }
  }, [isResizingColumn, saveAppSettings])

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
                    <div
                      key={column.id}
                      role="option"
                      aria-selected={column.getIsVisible()}
                      className="w-full inline-flex items-center gap-2 text-left text-xs px-1 py-1 rounded hover:bg-muted/50 cursor-pointer"
                      onClick={() => column.toggleVisibility()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          column.toggleVisibility()
                        }
                      }}
                      tabIndex={0}
                    >
                      <Checkbox
                        size="sm"
                        checked={column.getIsVisible()}
                        tabIndex={-1}
                      />
                      <span>{columnLabel(column.id)}</span>
                    </div>
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
              <table
                className={`w-full text-sm ${table.getState().columnSizingInfo.isResizingColumn ? "select-none" : ""}`}
                style={{ tableLayout: "fixed" }}
              >
                <thead className="bg-muted sticky top-0">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className="p-2 text-left font-medium relative min-w-0"
                          style={{ width: header.getSize() }}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                          {header.column.getCanResize() && (
                            // biome-ignore lint/a11y/noStaticElementInteractions: column resize drag handle
                            <div
                              onMouseDown={header.getResizeHandler()}
                              onTouchStart={header.getResizeHandler()}
                              className={`absolute right-0 top-0 h-full w-px cursor-col-resize select-none touch-none bg-border after:absolute after:inset-y-0 after:-left-1 after:-right-1 ${
                                header.column.getIsResizing()
                                  ? "bg-primary"
                                  : ""
                              }`}
                            />
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
                        row.original.status !== "active" ? "opacity-40" : ""
                      }`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="p-2 align-top min-w-0"
                          style={{ width: cell.column.getSize() }}
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

      <AlertDialog
        open={memberPendingDeletion != null}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setMemberPendingDeletion(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {memberPendingDeletion?.name ?? "member"} permanently?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the member from the roster and from all groups that
              reference them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmPermanentDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  if (id === "status") return "Status"
  if (id === "member_type") return "Role"
  if (id === "groups") return "Groups"
  if (id === "git_username") return "Git Username"
  return id
}

const memberStatusRank: Record<RosterMember["status"], number> = {
  active: 0,
  dropped: 1,
  incomplete: 2,
}

function compareRosterMembersByName(
  left: RosterMember,
  right: RosterMember,
): number {
  return chainComparisons(
    compareText(left.name, right.name),
    compareText(left.email, right.email),
    compareText(left.id, right.id),
  )
}

function compareRosterMemberNames(
  rowA: { original: RosterMember },
  rowB: {
    original: RosterMember
  },
): number {
  return compareRosterMembersByName(rowA.original, rowB.original)
}

function compareRosterMemberEmails(
  rowA: { original: RosterMember },
  rowB: {
    original: RosterMember
  },
): number {
  return chainComparisons(
    compareText(rowA.original.email, rowB.original.email),
    compareRosterMembersByName(rowA.original, rowB.original),
  )
}

function compareRosterMemberStatuses(
  rowA: { original: RosterMember },
  rowB: { original: RosterMember },
): number {
  return chainComparisons(
    compareNumber(
      memberStatusRank[rowA.original.status],
      memberStatusRank[rowB.original.status],
    ),
    compareRosterMembersByName(rowA.original, rowB.original),
  )
}

function compareRosterMemberRoles(
  rowA: { original: RosterMember },
  rowB: {
    original: RosterMember
  },
): number {
  return chainComparisons(
    compareNumber(
      rowA.original.enrollment_type === "student" ? 0 : 1,
      rowB.original.enrollment_type === "student" ? 0 : 1,
    ),
    compareRosterMembersByName(rowA.original, rowB.original),
  )
}

function compareRosterMemberGitUsernames(
  rowA: { original: RosterMember },
  rowB: { original: RosterMember },
): number {
  return chainComparisons(
    compareNullableText(rowA.original.git_username, rowB.original.git_username),
    compareRosterMembersByName(rowA.original, rowB.original),
  )
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
