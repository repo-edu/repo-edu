import {
  Button,
  Checkbox,
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
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Text,
} from "@repo-edu/ui"
import { cn } from "@repo-edu/ui/lib/utils"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  globMatches,
  validateGlobPattern,
} from "@repo-edu/domain/group-selection"
import {
  selectConnectedGroupSets,
  selectGroupsForGroupSet,
  selectLocalGroupSets,
  selectRoster,
  selectSystemGroupSet,
  useCourseStore,
} from "../../stores/course-store.js"
import { useUiStore } from "../../stores/ui-store.js"

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
  const createLocalGroupSet = useCourseStore(
    (state) => state.createLocalGroupSet,
  )
  const connectedSets = useCourseStore(selectConnectedGroupSets)
  const localSets = useCourseStore(selectLocalGroupSets)
  const individualStudentsSet = useCourseStore(
    selectSystemGroupSet("individual_students"),
  )
  const staffSet = useCourseStore(selectSystemGroupSet("staff"))
  const sourceGroups = useCourseStore(
    selectGroupsForGroupSet(sourceGroupSetId ?? ""),
  )
  const roster = useCourseStore(selectRoster)

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

  const sortedConnected = useMemo(
    () =>
      [...connectedSets]
        .filter((gs) => gs.nameMode === "named")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [connectedSets],
  )
  const sortedLocal = useMemo(
    () =>
      [...localSets]
        .filter((gs) => gs.nameMode === "named")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [localSets],
  )
  const systemSets = useMemo(() => {
    const sets: typeof connectedSets = []
    if (individualStudentsSet?.nameMode === "named")
      sets.push(individualStudentsSet)
    if (staffSet?.nameMode === "named") sets.push(staffSet)
    return sets
  }, [individualStudentsSet, staffSet])

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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const validationIdRef = useRef(0)
  const sourceGroupsRef = useRef(sourceGroups)
  sourceGroupsRef.current = sourceGroups

  const validatePattern = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const requestId = ++validationIdRef.current
      const groups = sourceGroupsRef.current

      const validation = validateGlobPattern(value)
      if (validationIdRef.current !== requestId) return
      if (!validation.ok) {
        setPatternError(validation.issues[0]?.message ?? "Invalid pattern")
        setMatchedIndexes(null)
        return
      }

      const matched: number[] = []
      for (let i = 0; i < groups.length; i++) {
        const result = globMatches(value, groups[i].name)
        if (result.ok && result.value) {
          matched.push(i)
        }
      }

      setPatternError(null)
      setMatchedIndexes(matched)
      setCheckedGroupIds(new Set(matched.map((index) => groups[index].id)))
    }, 400)
  }, [])

  useEffect(() => {
    if (pattern) {
      validatePattern(pattern)
    }
  }, [pattern, validatePattern])

  useEffect(() => {
    if (!sourceGroupSetId) return
    const groups = sourceGroupsRef.current
    setPattern("")
    setPatternError(null)
    setMatchedIndexes(null)
    setCheckedGroupIds(new Set(groups.map((g) => g.id)))
  }, [sourceGroupSetId])

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
      setOpen(false)
    } finally {
      setCreating(false)
    }
  }

  const resetDialogState = useCallback(() => {
    setName("")
    setSourceGroupSetId(null)
    setPattern("")
    setPatternError(null)
    setMatchedIndexes(null)
    setCheckedGroupIds(new Set())
    setCreating(false)
  }, [])

  const handleClose = () => {
    setOpen(false)
  }

  useEffect(() => {
    if (!open) {
      resetDialogState()
    }
  }, [open, resetDialogState])

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
              const memberNames = group.memberIds
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
    <Dialog open={open} onOpenChange={setOpen}>
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
                    <>
                      {systemSets.length > 0 && <SelectSeparator />}
                      <SelectGroup>
                        <SelectLabel>Connected</SelectLabel>
                        {sortedConnected.map((gs) => (
                          <SelectItem key={gs.id} value={gs.id}>
                            {gs.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </>
                  )}
                  {sortedLocal.length > 0 && (
                    <>
                      {(systemSets.length > 0 ||
                        sortedConnected.length > 0) && <SelectSeparator />}
                      <SelectGroup>
                        <SelectLabel>Local</SelectLabel>
                        {sortedLocal.map((gs) => (
                          <SelectItem key={gs.id} value={gs.id}>
                            {gs.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </>
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
