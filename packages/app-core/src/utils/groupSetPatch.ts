import type {
  GroupSetImportResult,
  GroupSetSyncResult,
  Roster,
} from "@repo-edu/backend-interface/types"

type GroupSetPatch = Pick<
  GroupSetImportResult | GroupSetSyncResult,
  "group_set" | "groups_upserted" | "deleted_group_ids"
>

/**
 * Apply a backend group-set patch to the in-memory roster.
 * Handles upsert, deletions, shared references, and orphan cleanup.
 */
export function applyGroupSetPatch(
  roster: Roster,
  patch: GroupSetPatch,
): Roster {
  const deleteSet = new Set(patch.deleted_group_ids)
  const upsertedIds = new Set(patch.groups_upserted.map((group) => group.id))

  const nextGroups = [
    ...roster.groups.filter(
      (group) => !deleteSet.has(group.id) && !upsertedIds.has(group.id),
    ),
    ...patch.groups_upserted,
  ]

  const nextGroupSets = roster.group_sets.map((groupSet) => {
    if (groupSet.id === patch.group_set.id) {
      return patch.group_set
    }
    if (deleteSet.size === 0) {
      return groupSet
    }
    return {
      ...groupSet,
      group_ids: groupSet.group_ids.filter(
        (groupId) => !deleteSet.has(groupId),
      ),
    }
  })

  const hasPatchedSet = nextGroupSets.some(
    (groupSet) => groupSet.id === patch.group_set.id,
  )
  if (!hasPatchedSet) {
    nextGroupSets.push(patch.group_set)
  }

  // Safety net: remove groups that are no longer referenced by any set.
  const referencedGroupIds = new Set(
    nextGroupSets.flatMap((groupSet) => groupSet.group_ids),
  )
  const cleanedGroups = nextGroups.filter((group) =>
    referencedGroupIds.has(group.id),
  )

  return {
    ...roster,
    groups: cleanedGroups,
    group_sets: nextGroupSets,
  }
}
