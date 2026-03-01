/**
 * GroupList - Shared group list with search and expandable member details.
 */

import type { Student } from "@repo-edu/backend-interface/types"
import { Button, Input } from "@repo-edu/ui"
import { AlertTriangle } from "@repo-edu/ui/components/icons"
import { useMemo, useState } from "react"
import { formatStudentStatus } from "../../utils/labels"

export interface GroupListEntry {
  id: string
  name: string
  memberIds: string[]
  unresolvedCount?: number
  needsResolution?: boolean
}

interface GroupListProps {
  groups: GroupListEntry[]
  students: Student[]
  editable?: boolean
  onEditGroup?: (groupId: string) => void
  onRemoveGroup?: (groupId: string) => void
  onAddGroup?: () => void
  addDisabled?: boolean
  addTitle?: string
  searchPlaceholder?: string
  emptyMessage?: string
  noResultsMessage?: string
  showSearch?: boolean
}

export function GroupList({
  groups,
  students,
  editable = false,
  onEditGroup,
  onRemoveGroup,
  onAddGroup,
  addDisabled = false,
  addTitle,
  searchPlaceholder = "Search groups and members...",
  emptyMessage = "No groups available.",
  noResultsMessage = "No groups match your search.",
  showSearch = true,
}: GroupListProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const showActions = Boolean(onEditGroup || onRemoveGroup)

  const studentMap = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students],
  )

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups
    const query = searchQuery.toLowerCase()
    return groups.filter((group) => {
      if (group.name.toLowerCase().includes(query)) return true
      return group.memberIds.some((id) => {
        const student = studentMap.get(id)
        return student?.name.toLowerCase().includes(query)
      })
    })
  }, [groups, searchQuery, studentMap])

  const toggleExpand = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {showSearch && (
        <div className="flex gap-2 px-3 py-2">
          <Input
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1"
          />
          {onAddGroup && (
            <Button
              size="sm"
              onClick={onAddGroup}
              disabled={addDisabled}
              title={addTitle}
            >
              + Add
            </Button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {filteredGroups.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            {groups.length === 0 ? emptyMessage : noResultsMessage}
          </p>
        ) : (
          filteredGroups.map((group) => (
            <GroupListItem
              key={group.id}
              group={group}
              studentMap={studentMap}
              expanded={expandedGroups.has(group.id)}
              onToggle={() => toggleExpand(group.id)}
              onEdit={() => onEditGroup?.(group.id)}
              onRemove={() => onRemoveGroup?.(group.id)}
              showActions={showActions}
              editable={editable}
            />
          ))
        )}
      </div>
    </div>
  )
}

interface GroupListItemProps {
  group: GroupListEntry
  studentMap: Map<string, Student>
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onRemove: () => void
  showActions: boolean
  editable: boolean
}

function GroupListItem({
  group,
  studentMap,
  expanded,
  onToggle,
  onEdit,
  onRemove,
  showActions,
  editable,
}: GroupListItemProps) {
  const members = group.memberIds.map((id) => {
    const student = studentMap.get(id)
    return {
      id,
      name: student?.name ?? `Unknown (${id})`,
      status: student?.status ?? null,
      isUnknown: !student,
    }
  })

  const unknownCount = members.filter((member) => member.isUnknown).length
  const unresolvedCount = group.unresolvedCount ?? 0
  const needsResolution = group.needsResolution ?? false
  const warningParts: string[] = []
  if (unresolvedCount > 0) warningParts.push(`${unresolvedCount} unresolved`)
  if (unknownCount > 0) warningParts.push(`${unknownCount} unknown`)
  if (needsResolution) warningParts.push("needs re-resolution")
  const warningLabel = warningParts.join(" · ")

  return (
    <div className="border rounded-md">
      <div className="flex w-full items-center gap-2 px-3 py-2 hover:bg-muted/50">
        <button
          type="button"
          className="flex-1 flex items-center gap-2 text-left cursor-pointer bg-transparent border-0 p-0"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <span className="text-xs w-4">{expanded ? "▼" : "▶"}</span>
          <span className="flex-1 font-medium">
            {group.name}
            <span className="text-muted-foreground font-normal ml-1">
              ({members.length} student{members.length !== 1 ? "s" : ""})
            </span>
          </span>
          {warningLabel && (
            <span className="inline-flex items-center gap-1 text-warning text-xs">
              <AlertTriangle className="size-3" aria-hidden="true" />
              <span>{warningLabel}</span>
            </span>
          )}
        </button>
        {showActions && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={onEdit}
              disabled={!editable}
              title={!editable ? "Linked groups are read-only" : undefined}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={onRemove}
              disabled={!editable}
              title={!editable ? "Linked groups are read-only" : undefined}
            >
              ×
            </Button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="px-3 py-2 bg-muted/30 border-t">
          {members.length === 0 ? (
            <span className="text-muted-foreground italic">No members</span>
          ) : (
            <div className="flex flex-wrap gap-2 text-xs">
              {members.map((member) => (
                <span
                  key={member.id}
                  className={
                    member.isUnknown
                      ? "text-warning"
                      : member.status && member.status !== "active"
                        ? "text-muted-foreground"
                        : ""
                  }
                >
                  {member.name}
                  {member.status && member.status !== "active"
                    ? ` (${formatStudentStatus(member.status)})`
                    : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
