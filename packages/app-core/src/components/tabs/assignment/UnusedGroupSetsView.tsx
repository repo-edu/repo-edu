/**
 * UnusedGroupSetsView - Lists cached LMS group sets not used by any assignment.
 *
 * Shows:
 * - List of cache entries not referenced by any assignment's group_set_cache_id
 * - Per-entry actions: Delete, Apply to assignment (future)
 */

import type {
  Assignment,
  LmsGroupSetCacheEntry,
} from "@repo-edu/backend-interface/types"
import { Button, EmptyState, Text } from "@repo-edu/ui"
import { AlertTriangle, Trash2 } from "@repo-edu/ui/components/icons"
import { useMemo, useState } from "react"
import { commands } from "../../../bindings/commands"
import { formatError } from "../../../services/commandUtils"
import { useProfileStore } from "../../../stores/profileStore"
import { useToastStore } from "../../../stores/toastStore"

interface UnusedGroupSetsViewProps {
  groupSets: LmsGroupSetCacheEntry[]
  assignments: Assignment[]
}

function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return "—"
  const date = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

export function UnusedGroupSetsView({
  groupSets,
  assignments,
}: UnusedGroupSetsViewProps) {
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const setRoster = useProfileStore((state) => state.setRoster)
  const addToast = useToastStore((state) => state.addToast)

  // Filter to only unused group sets
  const unusedGroupSets = useMemo(() => {
    const usedSetIds = new Set(
      assignments
        .map((a) => a.group_set_cache_id)
        .filter((id): id is string => id != null),
    )
    return groupSets.filter((set) => !usedSetIds.has(set.id))
  }, [groupSets, assignments])

  const handleDelete = async (groupSetId: string, groupSetName: string) => {
    if (!roster) return
    setDeletingIds((prev) => new Set(prev).add(groupSetId))

    try {
      const result = await commands.deleteCachedLmsGroupSet(roster, groupSetId)
      if (result.status === "ok") {
        setRoster(result.data, `Delete cached group set "${groupSetName}"`)
        addToast(`Deleted "${groupSetName}" from cache. Ctrl+Z to undo`, {
          tone: "warning",
        })
      } else {
        addToast(`Failed to delete: ${result.error.message}`, { tone: "error" })
      }
    } catch (error) {
      console.error("Failed to delete cached group set:", error)
      const { message } = formatError(error)
      addToast(`Failed to delete group set: ${message}`, { tone: "error" })
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev)
        next.delete(groupSetId)
        return next
      })
    }
  }

  if (unusedGroupSets.length === 0) {
    return (
      <EmptyState message="No unused group sets">
        <Text className="text-muted-foreground text-center">
          All cached group sets are currently assigned to assignments.
        </Text>
      </EmptyState>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-11 pb-3 border-b">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Unused Group Sets
        </span>
        <span className="text-xs text-muted-foreground">
          {unusedGroupSets.length} unused
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {unusedGroupSets.map((groupSet) => {
          const totalMembers = groupSet.groups.reduce(
            (acc, g) => acc + g.resolved_member_ids.length,
            0,
          )
          const unresolvedTotal = groupSet.groups.reduce(
            (acc, g) => acc + g.unresolved_count,
            0,
          )
          const needsReresolution = groupSet.groups.some(
            (g) => g.needs_reresolution,
          )
          const isDeleting = deletingIds.has(groupSet.id)

          return (
            <div key={groupSet.id} className="border rounded-md p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">
                      {groupSet.name}
                    </span>
                    {(unresolvedTotal > 0 || needsReresolution) && (
                      <span
                        className="text-xs text-warning flex items-center gap-1"
                        title={
                          needsReresolution
                            ? "Group members need re-resolution after roster changes"
                            : `${unresolvedTotal} LMS user(s) could not be matched to students`
                        }
                      >
                        <AlertTriangle className="size-3" />
                        {needsReresolution
                          ? "needs sync"
                          : `${unresolvedTotal} unresolved`}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {groupSet.groups.length} groups · {totalMembers} members ·
                    fetched {formatRelativeTime(groupSet.fetched_at)}
                  </div>
                </div>

                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(groupSet.id, groupSet.name)}
                    disabled={isDeleting}
                    title="Remove from cache"
                  >
                    <Trash2 className="size-3 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t text-xs text-muted-foreground">
        These group sets are cached but not linked to any assignment.
      </div>
    </div>
  )
}
