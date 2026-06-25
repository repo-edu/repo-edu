import type { Roster } from "@repo-edu/domain/types"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo-edu/ui"
import { ChevronDown, Loader2 } from "@repo-edu/ui/components/icons"
import type { ReactNode } from "react"
import { RosterSourceBadge } from "./MemberListHelpers.js"

/** Roster header bar: section label, source badge, and a slot for actions. */
export function MemberListHeader({
  roster,
  children,
}: {
  roster: Roster | null
  children: ReactNode
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">
        Roster
      </span>
      <RosterSourceBadge roster={roster} />
      <div className="ml-auto min-w-0 flex flex-wrap justify-end gap-2">
        {children}
      </div>
    </div>
  )
}

export function ImportRosterDropdown({
  importing,
  canImportFromLms,
  onImportFromLms,
  onImportFromFile,
}: {
  importing: boolean
  canImportFromLms: boolean
  onImportFromLms: () => void
  onImportFromFile: () => void
}) {
  return (
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
  )
}

export function ExportRosterDropdown({
  onExport,
}: {
  onExport: (format: "csv" | "xlsx") => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" title="Export the roster.">
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
  )
}

export function GitUsernamesDropdown({
  hasMembers,
  onImportGitUsernames,
  onVerifyGitUsernames,
}: {
  hasMembers: boolean
  onImportGitUsernames: () => void
  onVerifyGitUsernames: () => void
}) {
  return (
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
        <DropdownMenuItem onClick={onImportGitUsernames} disabled={!hasMembers}>
          Import from CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onVerifyGitUsernames} disabled={!hasMembers}>
          Verify
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
