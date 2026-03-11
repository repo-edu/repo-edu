import type { MemberStatus, Roster, RosterMember } from "@repo-edu/domain"
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
  DropdownMenu,
  DropdownMenuCheckboxItem,
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
import { useAppSettingsStore } from "../../../stores/app-settings-store.js"
import { useProfileStore } from "../../../stores/profile-store.js"
import { useUiStore } from "../../../stores/ui-store.js"
import { formatMemberStatus } from "../../../utils/labels.js"
import { generateMemberId } from "../../../utils/nanoid.js"
import {
  chainComparisons,
  compareNullableText,
  compareNumber,
  compareText,
  getNextProgressiveSorting,
  normalizeProgressiveSorting,
} from "../../../utils/sorting.js"
import { SortHeaderButton } from "../../common/SortHeaderButton.js"
import { EditableTextCell } from "./cells/EditableTextCell.js"
import { StatusCell } from "./cells/StatusSelectCell.js"

type MemberListPaneProps = {
  roster: Roster | null
  importing: boolean
  canImportFromLms: boolean
  lmsImportTooltip: string
  hasLmsConnection: boolean
  onImportFromLms: () => void
  onImportFromFile: () => void
  onImportGitUsernames: () => void
  onVerifyGitUsernames: () => void
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
  onImportGitUsernames,
  onVerifyGitUsernames,
  onClear,
  onExport,
}: MemberListPaneProps) {
  const openSettings = useUiStore((s) => s.openSettings)
  const rosterColumnVisibility = useAppSettingsStore(
    (s) => s.rosterColumnVisibility,
  )
  const setRosterColumnVisibility = useAppSettingsStore(
    (s) => s.setRosterColumnVisibility,
  )
  const rosterColumnSizing = useAppSettingsStore((s) => s.rosterColumnSizing)
  const setRosterColumnSizing = useAppSettingsStore(
    (s) => s.setRosterColumnSizing,
  )
  const saveAppSettings = useAppSettingsStore((s) => s.save)

  const addMember = useProfileStore((s) => s.addMember)
  const deleteMemberPermanently = useProfileStore(
    (s) => s.deleteMemberPermanently,
  )
  const updateMember = useProfileStore((s) => s.updateMember)

  const [globalFilter, setGlobalFilter] = useState("")
  const [sorting, setSorting] = useState<SortingState>([])
  const [addingMember, setAddingMember] = useState(false)
  const [memberPendingDeletion, setMemberPendingDeletion] =
    useState<RosterMember | null>(null)
  const [newMemberName, setNewMemberName] = useState("")
  const [newMemberEmail, setNewMemberEmail] = useState("")
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)

  const students = roster?.students ?? []
  const staff = roster?.staff ?? []
  const members = useMemo(() => [...students, ...staff], [students, staff])
  const studentCount = students.length
  const staffCount = staff.length
  const hasMembers = members.length > 0

  // Build a map of memberId → group names (excluding system groups).
  const memberGroupNames = useMemo(() => {
    const index = new Map<string, string[]>()
    if (!roster) return index

    const allMembers = [...roster.students, ...roster.staff]
    const activeIds = new Set(
      allMembers.filter((m) => m.status === "active").map((m) => m.id),
    )

    const systemGroupIds = new Set(
      roster.groupSets
        .filter((gs) => gs.connection?.kind === "system")
        .flatMap((gs) => gs.groupIds),
    )

    for (const group of roster.groups) {
      if (systemGroupIds.has(group.id)) continue
      for (const memberId of group.memberIds) {
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

  const handleAddMember = () => {
    if (!newMemberName.trim() || !newMemberEmail.trim()) return

    const member: RosterMember = {
      id: generateMemberId(),
      name: newMemberName.trim(),
      email: newMemberEmail.trim(),
      studentNumber: null,
      gitUsername: null,
      gitUsernameStatus: "unknown",
      status: "active",
      lmsStatus: null,
      lmsUserId: null,
      enrollmentType: "student",
      enrollmentDisplay: null,
      department: null,
      institution: null,
      source: "local",
    }

    addMember(member)
    setNewMemberName("")
    setNewMemberEmail("")
    setAddingMember(false)
  }

  const handleUpdateName = useCallback(
    (id: string, name: string) => {
      updateMember(id, { name })
    },
    [updateMember],
  )

  const handleUpdateEmail = useCallback(
    (id: string, email: string) => {
      updateMember(id, { email })
    },
    [updateMember],
  )

  const handleUpdateGitUsername = useCallback(
    (id: string, gitUsername: string) => {
      updateMember(id, {
        gitUsername: gitUsername || null,
        gitUsernameStatus: "unknown",
      })
    },
    [updateMember],
  )

  const handleUpdateStatus = useCallback(
    (id: string, status: MemberStatus) => {
      updateMember(id, { status })
    },
    [updateMember],
  )

  const handleRequestPermanentDelete = useCallback(
    (id: string) => {
      const member = members.find((entry) => entry.id === id)
      if (!member || member.source !== "local") return
      setMemberPendingDeletion(member)
    },
    [members],
  )

  const handleConfirmPermanentDelete = () => {
    if (!memberPendingDeletion) return
    const { id } = memberPendingDeletion
    deleteMemberPermanently(id)
    setMemberPendingDeletion(null)
  }

  const memberTypeLabel = useCallback((member: RosterMember): string => {
    switch (member.enrollmentType) {
      case "student":
        return "Student"
      case "teacher":
        return "Teacher"
      case "ta":
        return "TA"
      case "designer":
        return "Designer"
      case "observer":
        return "Observer"
      default:
        return "Other"
    }
  }, [])

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
            lmsStatus={row.original.lmsStatus ?? null}
            source={row.original.source}
            onChange={(status) => handleUpdateStatus(row.original.id, status)}
            onDeletePermanent={() =>
              handleRequestPermanentDelete(row.original.id)
            }
          />
        ),
      },
      {
        id: "memberType",
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
        id: "gitUsername",
        size: 180,
        minSize: 100,
        accessorFn: (row) => row.gitUsername ?? "",
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
            value={row.original.gitUsername ?? ""}
            onSave={(value) => handleUpdateGitUsername(row.original.id, value)}
            trailing={getStatusIcon(row.original.gitUsernameStatus)}
          />
        ),
      },
    ],
    [
      handleSort,
      memberGroupNames,
      handleUpdateName,
      handleUpdateEmail,
      handleUpdateGitUsername,
      handleUpdateStatus,
      handleRequestPermanentDelete,
      memberTypeLabel,
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
      void saveAppSettings()
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
        (member.gitUsername?.toLowerCase().includes(query) ?? false) ||
        formatMemberStatus(member.status).toLowerCase().includes(query) ||
        memberTypeLabel(member).toLowerCase().includes(query) ||
        (memberGroupNames
          .get(member.id)
          ?.some((name) => name.toLowerCase().includes(query)) ??
          false)
      )
    },
  })

  // Save column sizing to app settings when a resize operation ends.
  const isResizingColumn = table.getState().columnSizingInfo.isResizingColumn
  const prevIsResizingRef = useRef<string | false>(false)

  useEffect(() => {
    const wasResizing = prevIsResizingRef.current
    prevIsResizingRef.current = isResizingColumn
    if (wasResizing && !isResizingColumn) {
      void saveAppSettings()
    }
  }, [isResizingColumn, saveAppSettings])

  const hideableColumns = table
    .getAllLeafColumns()
    .filter((column) => column.getCanHide())

  const addMemberForm = (
    <div className="flex gap-2 items-center px-3 py-2 bg-muted/50">
      <Input
        placeholder="Name"
        value={newMemberName}
        onChange={(e) => setNewMemberName(e.target.value)}
        className="flex-1"
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAddMember()
        }}
      />
      <Input
        placeholder="Email"
        value={newMemberEmail}
        onChange={(e) => setNewMemberEmail(e.target.value)}
        className="flex-1"
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAddMember()
        }}
      />
      <Button
        size="sm"
        onClick={handleAddMember}
        disabled={!newMemberName.trim() || !newMemberEmail.trim()}
      >
        Add
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setAddingMember(false)}>
        <X className="size-4" />
      </Button>
    </div>
  )

  return (
    <div className="flex-1 min-w-0 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 min-h-11 pb-3 border-b">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">
          Roster
        </span>
        <RosterSourceBadge roster={roster} />
        <div className="ml-auto min-w-0 flex flex-wrap justify-end gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                disabled={importing}
                title="Import roster members."
              >
                {importing ? (
                  <>
                    <Loader2 className="size-4 mr-1 animate-spin" />
                    Importing…
                  </>
                ) : (
                  <>
                    Import
                    <ChevronDown className="size-4 ml-1" />
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={onImportFromLms}
                disabled={!canImportFromLms}
              >
                From LMS
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onImportFromFile}>
                From File
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {hasMembers && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  title="Export the roster."
                >
                  Export
                  <ChevronDown className="size-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onExport("csv")}>
                  Roster (CSV)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExport("xlsx")}>
                  Roster (XLSX)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                disabled={!hasMembers}
                title="Import or verify Git usernames."
              >
                Git Usernames
                <ChevronDown className="size-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={onImportGitUsernames}
                disabled={!hasMembers}
              >
                Import from CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onVerifyGitUsernames}
                disabled={!hasMembers}
              >
                Verify
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {hasMembers && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setClearConfirmOpen(true)}
              title="Remove all members, assignments, and groups."
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Empty state or member list */}
      {!hasMembers ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-4 text-center">
          <p className="text-muted-foreground max-w-md">
            {hasLmsConnection
              ? "No roster members yet. Import from your LMS or a file, or add manually."
              : "Import a roster from a CSV/Excel file, add manually, or configure an LMS connection to import directly."}
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
            <Button size="sm" variant="outline" onClick={onImportFromFile}>
              Import from File
            </Button>
            <Button size="sm" variant="outline" onClick={onImportGitUsernames}>
              Git Usernames
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAddingMember(true)}
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
          {addingMember && addMemberForm}
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddingMember(true)}
              title="Add a member manually"
            >
              <Plus className="size-4 mr-1" />
              Add Member
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {hideableColumns.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={() => column.toggleVisibility()}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {columnLabel(column.id)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Add member form */}
          {addingMember && addMemberForm}

          {/* Member table */}
          <div className="flex-1 min-h-0 px-3 pb-2">
            <div className="border rounded h-full overflow-y-auto">
              <table
                className={`w-full text-sm ${table.getState().columnSizingInfo.isResizingColumn ? "select-none" : ""}`}
                style={{ tableLayout: "fixed" }}
              >
                <thead className="bg-muted sticky top-0 z-10">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className="bg-muted p-2 text-left font-medium relative min-w-0"
                          style={{ width: header.getSize() }}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                          {header.column.getCanResize() && (
                            // biome-ignore lint/a11y/noStaticElementInteractions: column resize handle uses mouse/touch drag, not keyboard interaction
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
                          className="p-2 align-middle min-w-0"
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
            {studentCount} student{studentCount !== 1 ? "s" : ""} &middot;{" "}
            {staffCount} staff
          </div>
        </>
      )}

      {/* Clear roster confirmation dialog */}
      <AlertDialog
        open={clearConfirmOpen}
        onOpenChange={setClearConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear roster?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes all members, assignments, and groups from the current
              profile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setClearConfirmOpen(false)
                onClear()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanent delete confirmation dialog */}
      <AlertDialog
        open={memberPendingDeletion != null}
        onOpenChange={(open) => {
          if (!open) setMemberPendingDeletion(null)
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

function RosterSourceBadge({ roster }: { roster: Roster | null }) {
  if (!roster?.connection) return null

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
      sourceLabel = connection.sourceFilename
      break
  }

  return (
    <span className="text-xs text-muted-foreground truncate min-w-0">
      {sourceLabel}
      {connection.lastUpdated && (
        <> {new Date(connection.lastUpdated).toLocaleDateString()}</>
      )}
    </span>
  )
}

function columnLabel(id: string): string {
  switch (id) {
    case "name":
      return "Name"
    case "email":
      return "Email"
    case "status":
      return "Status"
    case "memberType":
      return "Role"
    case "groups":
      return "Groups"
    case "gitUsername":
      return "Git Username"
    default:
      return id
  }
}

const memberStatusRank: Record<MemberStatus, number> = {
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
  rowB: { original: RosterMember },
): number {
  return compareRosterMembersByName(rowA.original, rowB.original)
}

function compareRosterMemberEmails(
  rowA: { original: RosterMember },
  rowB: { original: RosterMember },
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

const ENROLLMENT_TYPE_ORDER: Record<string, number> = {
  student: 0,
  teacher: 1,
  ta: 2,
  designer: 3,
  observer: 4,
  other: 5,
}

function compareRosterMemberRoles(
  rowA: { original: RosterMember },
  rowB: { original: RosterMember },
): number {
  return chainComparisons(
    compareNumber(
      ENROLLMENT_TYPE_ORDER[rowA.original.enrollmentType] ?? 5,
      ENROLLMENT_TYPE_ORDER[rowB.original.enrollmentType] ?? 5,
    ),
    compareRosterMembersByName(rowA.original, rowB.original),
  )
}

function compareRosterMemberGitUsernames(
  rowA: { original: RosterMember },
  rowB: { original: RosterMember },
): number {
  return chainComparisons(
    compareNullableText(rowA.original.gitUsername, rowB.original.gitUsername),
    compareRosterMembersByName(rowA.original, rowB.original),
  )
}

function getStatusIcon(status: RosterMember["gitUsernameStatus"]) {
  switch (status) {
    case "valid":
      return <span className="text-success">&check;</span>
    case "invalid":
      return <span className="text-destructive">&cross;</span>
    default:
      return null
  }
}
