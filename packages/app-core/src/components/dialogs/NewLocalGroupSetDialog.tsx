/**
 * Dialog for creating a new local group set by copying groups from an existing set.
 *
 * The user selects a source group set and sees all groups with checkboxes.
 * An optional pattern filter narrows the visible list and auto-checks matches.
 * Only checked groups are copied (by reference) into the new set at creation time.
 */

import {
  Button,
  Checkbox,
  cn,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Text,
} from "@repo-edu/ui"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { commands } from "../../bindings/commands"
import {
  selectConnectedGroupSets,
  selectGroupsForGroupSet,
  selectLocalGroupSets,
  selectRoster,
  selectSystemGroupSet,
  useProfileStore,
} from "../../stores/profileStore"
import { useUiStore } from "../../stores/uiStore"

export function NewLocalGroupSetDialog() {
  const [name, setName] = useState("")
  const [sourceGroupSetId, setSourceGroupSetId] = useState<string | null>(null)
  const [pattern, setPattern] = useState("")
  const [patternError, setPatternError] = useState<string | null>(null)
  const [matchedIndexes, setMatchedIndexes] = useState<number[] | null>(null)
  const [checkedGroupIds, setCheckedGroupIds] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)

  const open = useUiStore((state) => state.newLocalGroupSetDialogOpen)
  const setOpen = useUiStore((state) => state.setNewLocalGroupSetDialogOpen)
  const setSidebarSelection = useUiStore((state) => state.setSidebarSelection)
  const createLocalGroupSet = useProfileStore(
    (state) => state.createLocalGroupSet,
  )
  const connectedSets = useProfileStore(selectConnectedGroupSets)
  const localSets = useProfileStore(selectLocalGroupSets)
  const individualStudentsSet = useProfileStore(
    selectSystemGroupSet("individual_students"),
  )
  const staffSet = useProfileStore(selectSystemGroupSet("staff"))
  const sourceGroups = useProfileStore(
    selectGroupsForGroupSet(sourceGroupSetId ?? ""),
  )
  const roster = useProfileStore(selectRoster)

  const memberNameById = useMemo(() => {
    if (!roster) return new Map<string, string>()
    const map = new Map<string, string>()
    for (const m of roster.students) {
      if (m.status === "active") map.set(m.id, m.name)
    }
    for (const m of roster.staff) {
      if (m.status === "active") map.set(m.id, m.name)
    }
    return map
  }, [roster])

  // Mirror sidebar order: connected (alpha) → local (alpha) → system
  const sortedConnected = useMemo(
    () => [...connectedSets].sort((a, b) => a.name.localeCompare(b.name)),
    [connectedSets],
  )
  const sortedLocal = useMemo(
    () => [...localSets].sort((a, b) => a.name.localeCompare(b.name)),
    [localSets],
  )
  const systemSets = useMemo(() => {
    const sets: typeof connectedSets = []
    if (individualStudentsSet) sets.push(individualStudentsSet)
    if (staffSet) sets.push(staffSet)
    return sets
  }, [individualStudentsSet, staffSet])

  // Compute which group indexes are visible in the preview
  const visibleIndexes = useMemo(() => {
    if (!pattern || matchedIndexes === null) {
      return sourceGroups.map((_, i) => i)
    }
    return matchedIndexes
  }, [pattern, matchedIndexes, sourceGroups])

  const visibleGroups = useMemo(
    () => visibleIndexes.map((i) => sourceGroups[i]),
    [visibleIndexes, sourceGroups],
  )

  const checkedCount = useMemo(
    () => visibleGroups.filter((g) => checkedGroupIds.has(g.id)).length,
    [visibleGroups, checkedGroupIds],
  )

  const trimmedName = name.trim()
  const canCreate =
    trimmedName.length > 0 &&
    sourceGroupSetId !== null &&
    !patternError &&
    checkedCount > 0 &&
    !creating

  // Debounced pattern validation — uses a ref for sourceGroups to keep the
  // callback reference stable and prevent re-validate effects from firing on
  // unrelated re-renders (e.g. checkbox toggles).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const validationIdRef = useRef(0)
  const sourceGroupsRef = useRef(sourceGroups)
  sourceGroupsRef.current = sourceGroups

  const validatePattern = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const requestId = ++validationIdRef.current
      const groups = sourceGroupsRef.current
      const groupNames = groups.map((g) => g.name)
      try {
        const result = await commands.filterByPattern(value, groupNames)
        if (validationIdRef.current !== requestId) return
        if (result.status === "ok" && result.data.valid) {
          setPatternError(null)
          setMatchedIndexes(result.data.matched_indexes)
          setCheckedGroupIds(
            new Set(result.data.matched_indexes.map((i) => groups[i].id)),
          )
        } else {
          setPatternError(
            result.status === "ok"
              ? (result.data.error ?? "Invalid pattern")
              : result.error.message,
          )
          setMatchedIndexes(null)
        }
      } catch {
        if (validationIdRef.current !== requestId) return
        setPatternError("Failed to validate pattern")
      }
    }, 400)
  }, [])

  // Re-validate when pattern changes
  useEffect(() => {
    if (pattern) {
      validatePattern(pattern)
    }
  }, [pattern, validatePattern])

  // Check all groups and reset filter when source group set changes.
  // Reads sourceGroups via ref to avoid unstable array references in deps.
  useEffect(() => {
    if (!sourceGroupSetId) return
    const groups = sourceGroupsRef.current
    setPattern("")
    setPatternError(null)
    setMatchedIndexes(null)
    setCheckedGroupIds(new Set(groups.map((g) => g.id)))
  }, [sourceGroupSetId])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const handlePatternChange = (value: string) => {
    setPattern(value)
    if (!value) {
      setPatternError(null)
      setMatchedIndexes(null)
      setCheckedGroupIds(new Set(sourceGroups.map((g) => g.id)))
      return
    }
    validatePattern(value)
  }

  const handleToggleGroup = (groupId: string) => {
    setCheckedGroupIds((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    setCheckedGroupIds((prev) => {
      const next = new Set(prev)
      for (const g of visibleGroups) next.add(g.id)
      return next
    })
  }

  const handleDeselectAll = () => {
    setCheckedGroupIds((prev) => {
      const next = new Set(prev)
      for (const g of visibleGroups) next.delete(g.id)
      return next
    })
  }

  const handleCreate = async () => {
    if (!canCreate || !sourceGroupSetId) return

    setCreating(true)
    try {
      const groupIds = visibleGroups
        .filter((g) => checkedGroupIds.has(g.id))
        .map((g) => g.id)

      const id = createLocalGroupSet(trimmedName, groupIds)
      if (id) {
        setSidebarSelection({ kind: "group-set", id })
      }
      handleClose()
    } finally {
      setCreating(false)
    }
  }

  const handleClose = () => {
    setOpen(false)
    setName("")
    setSourceGroupSetId(null)
    setPattern("")
    setPatternError(null)
    setMatchedIndexes(null)
    setCheckedGroupIds(new Set())
    setCreating(false)
  }

  const renderGroupPreview = () => {
    if (!sourceGroupSetId || sourceGroups.length === 0) return null

    return (
      <div className="flex flex-col gap-1 min-h-0 flex-1">
        <div className="flex items-center justify-between">
          <Text className="text-xs text-muted-foreground">
            {checkedCount} of {visibleGroups.length} groups selected
          </Text>
          <div className="flex gap-2">
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={handleSelectAll}
            >
              Select all
            </button>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={handleDeselectAll}
            >
              Deselect all
            </button>
          </div>
        </div>
        {visibleGroups.length > 0 && (
          <div className="border rounded-md min-h-0 flex-1 overflow-y-auto divide-y">
            {visibleGroups.map((group) => {
              const memberNames = group.member_ids
                .map((id) => memberNameById.get(id))
                .filter(Boolean)
                .join(", ")
              return (
                <div
                  key={group.id}
                  className="flex items-start gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/50"
                  role="option"
                  aria-selected={checkedGroupIds.has(group.id)}
                  onClick={() => handleToggleGroup(group.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      handleToggleGroup(group.id)
                    }
                  }}
                  tabIndex={0}
                >
                  <Checkbox
                    size="xs"
                    checked={checkedGroupIds.has(group.id)}
                    onCheckedChange={() => handleToggleGroup(group.id)}
                    onClick={(e) => e.stopPropagation()}
                    tabIndex={-1}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="font-medium">{group.name}</span>
                    {memberNames && (
                      <span className="text-muted-foreground">
                        {" "}
                        — {memberNames}
                      </span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="flex flex-col sm:max-w-xl h-[80vh]">
        <DialogHeader>
          <DialogTitle>Copy from Group Set</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 min-h-0 flex-1">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Name" htmlFor="group-set-name">
              <Input
                id="group-set-name"
                placeholder="e.g., Project Teams"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canCreate) handleCreate()
                }}
                autoFocus
              />
            </FormField>
            <FormField label="Source group set" htmlFor="source-gs-select">
              <Select
                value={sourceGroupSetId ?? undefined}
                onValueChange={setSourceGroupSetId}
              >
                <SelectTrigger id="source-gs-select">
                  <SelectValue placeholder="Select a group set" />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  {systemSets.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>System</SelectLabel>
                      {systemSets.map((gs) => (
                        <SelectItem key={gs.id} value={gs.id}>
                          {gs.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {sortedConnected.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Connected</SelectLabel>
                      {sortedConnected.map((gs) => (
                        <SelectItem key={gs.id} value={gs.id}>
                          {gs.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {sortedLocal.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Local</SelectLabel>
                      {sortedLocal.map((gs) => (
                        <SelectItem key={gs.id} value={gs.id}>
                          {gs.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          {sourceGroupSetId && (
            <div className="flex flex-col gap-2 min-h-0 flex-1">
              <div className="flex items-center gap-2">
                <Input
                  value={pattern}
                  onChange={(e) => handlePatternChange(e.target.value)}
                  placeholder="Filter by pattern, e.g., 1D* or Team-*"
                  className={cn(
                    "h-7 text-sm",
                    patternError && "border-destructive",
                  )}
                />
                {patternError && (
                  <p className="text-[11px] text-destructive shrink-0">
                    {patternError}
                  </p>
                )}
              </div>
              {renderGroupPreview()}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!canCreate}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
