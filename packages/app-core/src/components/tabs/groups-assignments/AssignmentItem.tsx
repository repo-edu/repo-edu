import type { Assignment, GroupSet } from "@repo-edu/backend-interface/types"
import { cn } from "@repo-edu/ui"
import { File } from "@repo-edu/ui/components/icons"
import type { KeyboardEvent } from "react"
import { useMemo } from "react"
import { useProfileStore } from "../../../stores/profileStore"
import type { SidebarSelection } from "../../../stores/uiStore"

interface AssignmentItemProps {
  assignment: Assignment
  groupSet: GroupSet
  selection: SidebarSelection
  onSelect: (selection: SidebarSelection) => void
  tabIndex?: number
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void
}

/**
 * Computes a short summary for the group selection mode of a group set.
 * E.g. "all · 12 groups" or "1D* · 5 groups"
 */
function useSelectionSummary(groupSet: GroupSet) {
  const rosterGroups = useProfileStore(
    (state) => state.document?.roster?.groups,
  )

  const groups = useMemo(() => {
    if (!rosterGroups) return []
    const groupMap = new Map(rosterGroups.map((g) => [g.id, g]))
    return groupSet.group_ids
      .map((gid) => groupMap.get(gid))
      .filter((g): g is NonNullable<typeof g> => !!g)
  }, [groupSet.group_ids, rosterGroups])

  return useMemo(() => {
    const sel = groupSet.group_selection
    const excluded = new Set(sel.excluded_group_ids ?? [])

    if (sel.kind === "all") {
      const count = groups.filter((g) => !excluded.has(g.id)).length
      return `all · ${count} group${count !== 1 ? "s" : ""}`
    }

    // pattern mode
    const matchingGroups = groups.filter(
      (g) => !excluded.has(g.id) && matchGlob(sel.pattern, g.name),
    )
    return `${sel.pattern} · ${matchingGroups.length} group${matchingGroups.length !== 1 ? "s" : ""}`
  }, [groupSet.group_selection, groups])
}

/** Simple glob matcher supporting only trailing '*' for sidebar display. */
function matchGlob(pattern: string, name: string): boolean {
  if (pattern.endsWith("*")) {
    return name.startsWith(pattern.slice(0, -1))
  }
  return pattern === name
}

export function AssignmentItem({
  assignment,
  groupSet,
  selection,
  onSelect,
  tabIndex,
  onKeyDown,
}: AssignmentItemProps) {
  const isSelected =
    selection?.kind === "assignment" && selection.id === assignment.id
  const summary = useSelectionSummary(groupSet)

  return (
    <button
      type="button"
      className={cn(
        "w-full text-left pl-8 pr-2 py-1.5 text-xs rounded-md",
        isSelected
          ? "bg-accent text-accent-foreground"
          : "hover:bg-muted/50 text-muted-foreground",
      )}
      onClick={() => onSelect({ kind: "assignment", id: assignment.id })}
      onKeyDown={onKeyDown}
      tabIndex={tabIndex}
      data-sidebar-item-id={`assignment:${assignment.id}`}
    >
      <div className="flex items-center gap-1.5">
        <File className="size-3 shrink-0" />
        <span className="truncate font-medium">{assignment.name}</span>
      </div>
      <div className="pl-[18px] text-[11px] opacity-70">{summary}</div>
    </button>
  )
}
