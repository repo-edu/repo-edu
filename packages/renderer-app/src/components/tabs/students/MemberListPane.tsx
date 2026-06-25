import type { MemberStatus, Roster, RosterMember } from "@repo-edu/domain/types"
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Input,
} from "@repo-edu/ui"
import { ArrowUp, Plus, Search } from "@repo-edu/ui/components/icons"
import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  type Updater,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table"
import { useCallback, useMemo, useState } from "react"
import { useSessionController } from "../../../session/session-controller-context.js"
import { useAppSettingsStore } from "../../../stores/app-settings-store.js"
import { useUiStore } from "../../../stores/ui-store.js"
import { formatMemberStatus } from "../../../utils/labels.js"
import {
  getNextProgressiveSorting,
  normalizeProgressiveSorting,
} from "../../../utils/sorting.js"
import { AddMemberForm } from "./AddMemberForm.js"
import {
  ClearRosterDialog,
  PermanentDeleteDialog,
} from "./MemberListDialogs.js"
import {
  ExportRosterDropdown,
  GitUsernamesDropdown,
  ImportRosterDropdown,
  MemberListHeader,
} from "./MemberListHeader.js"
import {
  buildMemberGroupNames,
  columnLabel,
  memberTypeLabel,
} from "./MemberListHelpers.js"
import { MemberTable } from "./MemberTable.js"
import { useMemberColumns } from "./member-columns.js"
import { useScrollBackToTop } from "./use-scroll-back-to-top.js"

type MemberListPaneProps = {
  courseId: string
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
  courseId,
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

  const controller = useSessionController()

  const { scrollRef, showBackToTop, scrollToTop } = useScrollBackToTop()

  const [globalFilter, setGlobalFilter] = useState("")
  const [sorting, setSorting] = useState<SortingState>([])
  const [addingMember, setAddingMember] = useState(false)
  const [memberPendingDeletion, setMemberPendingDeletion] =
    useState<RosterMember | null>(null)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)

  const students = roster?.students ?? []
  const staff = roster?.staff ?? []
  const members = useMemo(() => [...students, ...staff], [students, staff])
  const studentCount = students.length
  const staffCount = staff.length
  const hasMembers = members.length > 0

  const memberGroupNames = useMemo(
    () => buildMemberGroupNames(roster),
    [roster],
  )

  const handleAddMember = (name: string, email: string) => {
    const member: RosterMember = {
      id: "",
      name,
      email,
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

    controller.addMember(courseId, member)
    setAddingMember(false)
  }

  const handleUpdateName = useCallback(
    (id: string, name: string) => {
      controller.updateMember(courseId, id, { name })
    },
    [controller, courseId],
  )

  const handleUpdateEmail = useCallback(
    (id: string, email: string) => {
      controller.updateMember(courseId, id, { email })
    },
    [controller, courseId],
  )

  const handleUpdateGitUsername = useCallback(
    (id: string, gitUsername: string) => {
      controller.updateMember(courseId, id, {
        gitUsername: gitUsername || null,
        gitUsernameStatus: "unknown",
      })
    },
    [controller, courseId],
  )

  const handleUpdateStatus = useCallback(
    (id: string, status: MemberStatus) => {
      controller.updateMember(courseId, id, { status })
    },
    [controller, courseId],
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
    controller.deleteMemberPermanently(courseId, id)
    setMemberPendingDeletion(null)
  }

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

  const columns = useMemberColumns({
    memberGroupNames,
    onSort: handleSort,
    onUpdateName: handleUpdateName,
    onUpdateEmail: handleUpdateEmail,
    onUpdateGitUsername: handleUpdateGitUsername,
    onUpdateStatus: handleUpdateStatus,
    onRequestPermanentDelete: handleRequestPermanentDelete,
  })

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

  const hideableColumns = table
    .getAllLeafColumns()
    .filter((column) => column.getCanHide())

  return (
    <div className="flex-1 min-w-0 flex flex-col min-h-0">
      {!hasMembers ? (
        <>
          <MemberListHeader roster={roster}>
            <ImportRosterDropdown
              importing={importing}
              canImportFromLms={canImportFromLms}
              onImportFromLms={onImportFromLms}
              onImportFromFile={onImportFromFile}
            />
            <GitUsernamesDropdown
              hasMembers={hasMembers}
              onImportGitUsernames={onImportGitUsernames}
              onVerifyGitUsernames={onVerifyGitUsernames}
            />
          </MemberListHeader>
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
            {addingMember && (
              <AddMemberForm
                onAdd={handleAddMember}
                onCancel={() => setAddingMember(false)}
              />
            )}
          </div>
        </>
      ) : (
        <>
          {/* Scrollable area: toolbar, search, add-member form, and table */}
          <div className="flex-1 min-h-0 relative">
            <div ref={scrollRef} className="h-full overflow-y-auto">
              <MemberListHeader roster={roster}>
                <ImportRosterDropdown
                  importing={importing}
                  canImportFromLms={canImportFromLms}
                  onImportFromLms={onImportFromLms}
                  onImportFromFile={onImportFromFile}
                />
                <ExportRosterDropdown onExport={onExport} />
                <GitUsernamesDropdown
                  hasMembers={hasMembers}
                  onImportGitUsernames={onImportGitUsernames}
                  onVerifyGitUsernames={onVerifyGitUsernames}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setClearConfirmOpen(true)}
                  title="Remove all members, assignments, and groups."
                >
                  Clear
                </Button>
              </MemberListHeader>

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

              {addingMember && (
                <AddMemberForm
                  onAdd={handleAddMember}
                  onCancel={() => setAddingMember(false)}
                />
              )}

              <MemberTable table={table} globalFilter={globalFilter} />
            </div>

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

          <div className="px-3 py-2 border-t text-sm text-muted-foreground">
            {studentCount} student{studentCount !== 1 ? "s" : ""} &middot;{" "}
            {staffCount} staff
          </div>
        </>
      )}

      <ClearRosterDialog
        open={clearConfirmOpen}
        onOpenChange={setClearConfirmOpen}
        onConfirm={() => {
          setClearConfirmOpen(false)
          onClear()
        }}
      />

      <PermanentDeleteDialog
        member={memberPendingDeletion}
        onOpenChange={(open) => {
          if (!open) setMemberPendingDeletion(null)
        }}
        onConfirm={handleConfirmPermanentDelete}
      />
    </div>
  )
}
