import type { MemberStatus, Roster, RosterMember } from "@repo-edu/domain/types"
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
  ArrowUp,
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
import { useCourseStore } from "../../../stores/course-store.js"
import { useUiStore } from "../../../stores/ui-store.js"
import { formatMemberStatus } from "../../../utils/labels.js"
import {
  chainComparisons,
  compareText,
  getNextProgressiveSorting,
  normalizeProgressiveSorting,
} from "../../../utils/sorting.js"
import { SortHeaderButton } from "../../common/SortHeaderButton.js"
import { EditableTextCell } from "./cells/EditableTextCell.js"
import { StatusCell } from "./cells/StatusSelectCell.js"
import {
  columnLabel,
  compareRosterMemberEmails,
  compareRosterMemberGitUsernames,
  compareRosterMemberNames,
  compareRosterMemberRoles,
  compareRosterMemberStatuses,
  compareRosterMembersByName,
  getStatusIcon,
  RosterSourceBadge,
} from "./MemberListHelpers.js"

/** Minimum scroll fraction before the back-to-top button appears.
 *  Avoids showing the button when only a small amount has been scrolled. */
const SCROLL_TOP_THRESHOLD = 0.15
const ROSTER_COLUMN_WIDTHS = {
  name: 200,
  email: 260,
  status: 110,
  memberType: 90,
  groups: 150,
  gitUsername: 190,
} as const
const ROSTER_COLUMN_MIN_WIDTHS = {
  name: 100,
  email: 120,
  status: 80,
  memberType: 60,
  groups: 80,
  gitUsername: 100,
} as const

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
    (s) => s.settings.rosterColumnVisibility,
  )
  const setRosterColumnVisibility = useAppSettingsStore(
    (s) => s.setRosterColumnVisibility,
  )
  const rosterColumnSizing = useAppSettingsStore(
    (s) => s.settings.rosterColumnSizing,
  )
  const setRosterColumnSizing = useAppSettingsStore(
    (s) => s.setRosterColumnSizing,
  )
  const saveAppSettings = useAppSettingsStore((s) => s.save)

  const addMember = useCourseStore((s) => s.addMember)
  const deleteMemberPermanently = useCourseStore(
    (s) => s.deleteMemberPermanently,
  )
  const updateMember = useCourseStore((s) => s.updateMember)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [showBackToTop, setShowBackToTop] = useState(false)

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const maxScroll = el.scrollHeight - el.clientHeight
    setShowBackToTop(
      maxScroll > 0 && el.scrollTop / maxScroll > SCROLL_TOP_THRESHOLD,
    )
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateScrollState()
    el.addEventListener("scroll", updateScrollState, { passive: true })
    const observer = new ResizeObserver(updateScrollState)
    observer.observe(el)
    return () => {
      el.removeEventListener("scroll", updateScrollState)
      observer.disconnect()
    }
  }, [updateScrollState])

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
  }, [])

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
      roster.groupSets.flatMap((groupSet) => {
        if (
          groupSet.connection?.kind !== "system" ||
          groupSet.nameMode !== "named"
        ) {
          return []
        }
        return groupSet.groupIds
      }),
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
      id: "",
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
        size: ROSTER_COLUMN_WIDTHS.name,
        minSize: ROSTER_COLUMN_MIN_WIDTHS.name,
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
        size: ROSTER_COLUMN_WIDTHS.email,
        minSize: ROSTER_COLUMN_MIN_WIDTHS.email,
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
        size: ROSTER_COLUMN_WIDTHS.status,
        minSize: ROSTER_COLUMN_MIN_WIDTHS.status,
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
        size: ROSTER_COLUMN_WIDTHS.memberType,
        minSize: ROSTER_COLUMN_MIN_WIDTHS.memberType,
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
        size: ROSTER_COLUMN_WIDTHS.groups,
        minSize: ROSTER_COLUMN_MIN_WIDTHS.groups,
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
        size: ROSTER_COLUMN_WIDTHS.gitUsername,
        minSize: ROSTER_COLUMN_MIN_WIDTHS.gitUsername,
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
  const totalColumnSize = table.getTotalSize()
  const toColumnWidth = (size: number): string | undefined =>
    totalColumnSize > 0 ? `${(size / totalColumnSize) * 100}%` : undefined

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
      {/* Empty state */}
      {!hasMembers ? (
        <>
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b">
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
            </div>
          </div>
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
              <Button
                size="sm"
                variant="outline"
                onClick={onImportGitUsernames}
              >
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
                onClick={() => openSettings("lms-connections")}
              >
                Configure LMS Connection
              </Button>
            )}
            {addingMember && addMemberForm}
          </div>
        </>
      ) : (
        <>
          {/* Scrollable area: toolbar, search, add-member form, and table */}
          <div className="flex-1 min-h-0 relative">
            <div ref={scrollRef} className="h-full overflow-y-auto">
              {/* Header toolbar */}
              <div className="flex items-center gap-2 px-3 py-2 border-b">
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
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setClearConfirmOpen(true)}
                    title="Remove all members, assignments, and groups."
                  >
                    Clear
                  </Button>
                </div>
              </div>

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
              <div className="px-3 pb-2">
                <div className="border rounded">
                  <table
                    className={`w-full text-sm ${table.getState().columnSizingInfo.isResizingColumn ? "select-none" : ""}`}
                    style={{ tableLayout: "fixed" }}
                  >
                    <thead className="bg-muted">
                      {table.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id}>
                          {headerGroup.headers.map((header) => (
                            <th
                              key={header.id}
                              className="bg-muted sticky top-0 z-10 p-2 text-left font-medium relative min-w-0"
                              style={{ width: toColumnWidth(header.getSize()) }}
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
                              style={{
                                width: toColumnWidth(cell.column.getSize()),
                              }}
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
            </div>

            {/* Back to top button */}
            {showBackToTop && (
              <button
                type="button"
                onClick={scrollToTop}
                className="absolute bottom-3 right-6 z-20 size-7 flex items-center justify-center rounded-full border bg-background/90 shadow-sm backdrop-blur-sm text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
                title="Scroll to top"
              >
                <ArrowUp className="size-4" />
              </button>
            )}
          </div>

          {/* Footer summary */}
          <div className="px-3 py-2 border-t text-sm text-muted-foreground">
            {studentCount} student{studentCount !== 1 ? "s" : ""} &middot;{" "}
            {staffCount} staff
          </div>
        </>
      )}

      {/* Clear roster confirmation dialog */}
      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear roster?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes all members, assignments, and groups from the current
              course.
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
