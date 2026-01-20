/**
 * AllGroupSetsView - Lists all cached LMS group sets with management actions.
 *
 * Shows:
 * - List of all cache entries with staleness indicators
 * - Per-entry actions: Refresh, Delete, Apply to assignment
 * - Staleness is based on 24h threshold
 */

import type {
  Assignment,
  LmsGroupSetCacheEntry,
} from "@repo-edu/backend-interface/types"
import { Button, EmptyState, Text } from "@repo-edu/ui"
import { AlertTriangle, RefreshCw, Trash2 } from "@repo-edu/ui/components/icons"
import { useState } from "react"
import { commands } from "../../../bindings/commands"
import { formatError } from "../../../services/commandUtils"
import { useAppSettingsStore } from "../../../stores/appSettingsStore"
import { useProfileStore } from "../../../stores/profileStore"
import { useToastStore } from "../../../stores/toastStore"
import { buildLmsOperationContext } from "../../../utils/operationContext"

interface AllGroupSetsViewProps {
  groupSets: LmsGroupSetCacheEntry[]
  assignments: Assignment[]
}

const STALENESS_THRESHOLD_MS = 24 * 60 * 60 * 1000 // 24 hours

function isStale(fetchedAt: string | null): boolean {
  if (!fetchedAt) return false
  const fetchedTime = Date.parse(fetchedAt)
  if (Number.isNaN(fetchedTime)) return false
  return Date.now() - fetchedTime > STALENESS_THRESHOLD_MS
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

export function AllGroupSetsView({
  groupSets,
  assignments,
}: AllGroupSetsViewProps) {
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set())
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const setRoster = useProfileStore((state) => state.setRoster)
  const courseId = useProfileStore(
    (state) => state.document?.settings.course.id ?? "",
  )
  const lmsConnection = useAppSettingsStore((state) => state.lmsConnection)
  const addToast = useToastStore((state) => state.addToast)

  const lmsContext = buildLmsOperationContext(lmsConnection, courseId)

  // Build a map of which assignments use which group sets
  const groupSetUsage = new Map<string, Assignment[]>()
  for (const assignment of assignments) {
    if (assignment.group_set_cache_id) {
      const existing = groupSetUsage.get(assignment.group_set_cache_id) ?? []
      existing.push(assignment)
      groupSetUsage.set(assignment.group_set_cache_id, existing)
    }
  }

  const handleRefresh = async (groupSetId: string) => {
    if (!roster || !lmsContext) return
    setRefreshingIds((prev) => new Set(prev).add(groupSetId))

    try {
      const result = await commands.refreshCachedLmsGroupSet(
        lmsContext,
        roster,
        groupSetId,
      )
      if (result.status === "ok") {
        setRoster(result.data, "Refresh cached group set")
        addToast("Group set refreshed from LMS")
      } else {
        addToast(`Failed to refresh: ${result.error.message}`, {
          tone: "error",
        })
      }
    } catch (error) {
      console.error("Failed to refresh cached group set:", error)
      const { message } = formatError(error)
      addToast(`Failed to refresh group set: ${message}`, { tone: "error" })
    } finally {
      setRefreshingIds((prev) => {
        const next = new Set(prev)
        next.delete(groupSetId)
        return next
      })
    }
  }

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

  if (groupSets.length === 0) {
    return (
      <EmptyState message="No cached group sets">
        <Text className="text-muted-foreground text-center">
          Import group sets from the LMS to cache them here.
        </Text>
      </EmptyState>
    )
  }

  const hasLmsContext = lmsContext !== null

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-11 pb-3 border-b">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          All Group Sets
        </span>
        <span className="text-xs text-muted-foreground">
          {groupSets.length} cached
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {groupSets.map((groupSet) => {
          const usedBy = groupSetUsage.get(groupSet.id) ?? []
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
          const stale = isStale(groupSet.fetched_at)
          const canRefresh = groupSet.origin === "lms"
          const isRefreshing = refreshingIds.has(groupSet.id)
          const isDeleting = deletingIds.has(groupSet.id)

          return (
            <div key={groupSet.id} className="border rounded-md p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">
                      {groupSet.name}
                    </span>
                    {stale && (
                      <span
                        className="text-xs text-warning flex items-center gap-1"
                        title="Data may be outdated"
                      >
                        <AlertTriangle className="size-3" />
                        stale
                      </span>
                    )}
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
                    {groupSet.origin === "local" && " · local"}
                  </div>
                  {usedBy.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Used by: {usedBy.map((a) => a.name).join(", ")}
                    </div>
                  )}
                </div>

                <div className="flex gap-1 shrink-0">
                  {canRefresh && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => handleRefresh(groupSet.id)}
                      disabled={!hasLmsContext || isRefreshing || isDeleting}
                      title={
                        hasLmsContext
                          ? "Refresh from LMS"
                          : "No LMS connection configured"
                      }
                    >
                      <RefreshCw
                        className={`size-3 mr-1 ${isRefreshing ? "animate-spin" : ""}`}
                      />
                      Refresh
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(groupSet.id, groupSet.name)}
                    disabled={isRefreshing || isDeleting}
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
        Cached group sets are stored locally and can be applied to assignments.
      </div>
    </div>
  )
}
