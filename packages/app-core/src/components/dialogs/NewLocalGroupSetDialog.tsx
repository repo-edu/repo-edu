/**
 * Dialog for creating a new local group set from an existing group set's groups.
 *
 * The user selects a source group set and optionally filters by pattern.
 * A preview shows matched groups with member names and checkboxes for selection.
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
  Label,
  RadioGroup,
  RadioGroupItem,
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
  const [selectionKind, setSelectionKind] = useState<"all" | "pattern">("all")
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
    for (const m of roster.students) map.set(m.id, m.name)
    for (const m of roster.staff) map.set(m.id, m.name)
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
    if (selectionKind === "all") {
      return sourceGroups.map((_, i) => i)
    }
    return matchedIndexes ?? []
  }, [selectionKind, matchedIndexes, sourceGroups])

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

  // Debounced pattern validation
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const validationIdRef = useRef(0)

  const validatePattern = useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        const requestId = ++validationIdRef.current
        const groupNames = sourceGroups.map((g) => g.name)
        try {
          const result = await commands.filterByPattern(value, groupNames)
          if (validationIdRef.current !== requestId) return
          if (result.status === "ok" && result.data.valid) {
            setPatternError(null)
            setMatchedIndexes(result.data.matched_indexes)
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
    },
    [sourceGroups],
  )

  // Re-validate when source changes while in pattern mode
  useEffect(() => {
    if (selectionKind === "pattern" && pattern) {
      validatePattern(pattern)
    }
  }, [sourceGroupSetId, selectionKind, pattern, validatePattern])

  // Check all groups when source group set changes or dialog reopens
  const prevSourceGroupSetIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!sourceGroupSetId || sourceGroups.length === 0) return
    if (sourceGroupSetId !== prevSourceGroupSetIdRef.current) {
      prevSourceGroupSetIdRef.current = sourceGroupSetId
      setCheckedGroupIds(new Set(sourceGroups.map((g) => g.id)))
    }
  })

  // Check all matched groups when pattern match results change
  useEffect(() => {
    if (selectionKind === "pattern" && matchedIndexes !== null) {
      setCheckedGroupIds(new Set(matchedIndexes.map((i) => sourceGroups[i].id)))
    }
    // Only react to matchedIndexes changes, not sourceGroups reference
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedIndexes])

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
    setSelectionKind("all")
    setPattern("")
    setPatternError(null)
    setMatchedIndexes(null)
    prevSourceGroupSetIdRef.current = null
    setCheckedGroupIds(new Set())
    setCreating(false)
  }

  const renderGroupPreview = () => {
    if (!sourceGroupSetId || sourceGroups.length === 0) return null
    if (
      selectionKind === "pattern" &&
      (patternError || matchedIndexes === null)
    )
      return null

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
          <DialogTitle>New Local Group Set</DialogTitle>
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
            <div className="flex flex-col gap-2 min-h-0 flex-1 pt-3">
              <div className="flex items-center gap-4">
                <Label className="text-sm font-medium shrink-0">
                  Group selection
                </Label>
                <RadioGroup
                  value={selectionKind}
                  onValueChange={(v) =>
                    setSelectionKind(v as "all" | "pattern")
                  }
                  className="flex flex-row gap-3"
                >
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="all" id="new-gs-sel-all" />
                    <Label htmlFor="new-gs-sel-all" className="text-sm">
                      All ({sourceGroups.length})
                    </Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="pattern" id="new-gs-sel-pattern" />
                    <Label htmlFor="new-gs-sel-pattern" className="text-sm">
                      Pattern
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              {selectionKind === "pattern" && (
                <div className="flex items-center gap-2">
                  <Input
                    value={pattern}
                    onChange={(e) => handlePatternChange(e.target.value)}
                    placeholder="e.g., 1D* or Team-*"
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
              )}
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
